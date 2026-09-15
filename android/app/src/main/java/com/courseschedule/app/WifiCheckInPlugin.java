package com.courseschedule.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "WifiCheckIn")
public class WifiCheckInPlugin extends Plugin {

    private static final int PORT = 8080;
    private static final Pattern NAME_RE = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]*)\"");
    private static final Pattern ID_RE = Pattern.compile("\"id\"\\s*:\\s*\"([^\"]*)\"");

    private ServerSocket serverSocket;
    private volatile boolean running = false;
    private final List<String[]> checkins = new ArrayList<>();

    @PluginMethod
    public void start(PluginCall call) {
        if (running) { call.resolve(makeInfo()); return; }
        try {
            serverSocket = new ServerSocket(PORT);
            running = true;
            Thread t = new Thread(this::acceptLoop);
            t.start();
            call.resolve(makeInfo());
        } catch (IOException e) {
            call.reject("WiFi 签到服务启动失败（端口 " + PORT + "）：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        running = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) { }
        serverSocket = null;
        synchronized (checkins) { checkins.clear(); }
        call.resolve();
    }

    @PluginMethod
    public void getInfo(PluginCall call) { call.resolve(makeInfo()); }

    private JSObject makeInfo() {
        JSObject ret = new JSObject();
        ret.put("port", PORT);
        ret.put("running", running);
        JSArray ips = new JSArray();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<java.net.InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    java.net.InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) ips.put(a.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        ret.put("ips", ips);
        return ret;
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket s = serverSocket.accept();
                new Thread(() -> handle(s)).start();
            } catch (IOException e) {
                break;
            }
        }
    }

    private void handle(Socket s) {
        try {
            BufferedReader in = new BufferedReader(
                    new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            String line = in.readLine();
            if (line == null) { s.close(); return; }
            String[] parts = line.split(" ");
            String method = parts.length > 0 ? parts[0] : "GET";
            String path = parts.length > 1 ? parts[1] : "/";
            int contentLength = 0;
            String h;
            while ((h = in.readLine()) != null && !h.isEmpty()) {
                if (h.toLowerCase().startsWith("content-length:")) {
                    try { contentLength = Integer.parseInt(h.substring(15).trim()); } catch (NumberFormatException ignored) { }
                }
            }
            String body = "";
            if (contentLength > 0 && contentLength < 10000) {
                char[] buf = new char[contentLength];
                int read = 0;
                while (read < contentLength) {
                    int r = in.read(buf, read, contentLength - read);
                    if (r < 0) break;
                    read += r;
                }
                body = new String(buf, 0, read);
            }

            if ("POST".equals(method) && path.startsWith("/api/checkin")) {
                String name = extract(body, NAME_RE);
                String id = extract(body, ID_RE);
                if (!name.isEmpty() && name.length() <= 50 && id.length() <= 20) {
                    addCheckin(id, name);
                    JSObject data = new JSObject();
                    data.put("name", name);
                    data.put("id", id);
                    notifyListeners("checkin", data);
                    respond(s, "application/json", "{\"ok\":true}");
                } else {
                    respond(s, "application/json", "{\"ok\":false,\"msg\":\"bad payload\"}");
                }
            } else if ("GET".equals(method) && path.startsWith("/api/list")) {
                respond(s, "application/json", listJson());
            } else if ("GET".equals(method) && path.startsWith("/api/clear")) {
                synchronized (checkins) { checkins.clear(); }
                respond(s, "application/json", "{\"ok\":true}");
            } else if ("GET".equals(method) && path.startsWith("/monitor")) {
                respond(s, "text/html; charset=utf-8", asset("monitor.html"));
            } else {
                respond(s, "text/html; charset=utf-8", asset("student.html"));
            }
            s.close();
        } catch (Exception ignored) {
            try { s.close(); } catch (IOException ignored2) { }
        }
    }

    private static String extract(String body, Pattern p) {
        Matcher m = p.matcher(body == null ? "" : body);
        return m.find() ? m.group(1).trim() : "";
    }

    private void addCheckin(String id, String name) {
        String time = new java.text.SimpleDateFormat("HH:mm:ss")
                .format(new java.util.Date());
        synchronized (checkins) {
            for (String[] row : checkins) {
                boolean same = !id.isEmpty() && id.equals(row[0]);
                if (!same && name.equals(row[1])) same = true;
                if (same) { row[2] = time + "（重签）"; return; }
            }
            checkins.add(new String[] { id, name, time });
        }
    }

    private String listJson() {
        StringBuilder sb = new StringBuilder("{\"total\":");
        List<String[]> copy;
        synchronized (checkins) { copy = new ArrayList<>(checkins); }
        sb.append(copy.size()).append(",\"students\":[");
        for (int i = 0; i < copy.size(); i++) {
            String[] r = copy.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"id\":\"").append(esc(r[0])).append("\",\"name\":\"")
              .append(esc(r[1])).append("\",\"time\":\"").append(esc(r[2])).append("\"}");
        }
        return sb.append("]}").toString();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String asset(String name) {
        try {
            InputStream is = getContext().getAssets().open("public/" + name);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int n;
            while ((n = is.read(b)) > 0) bo.write(b, 0, n);
            is.close();
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "<html><body style=\"font-family:sans-serif;padding:30px\">页面缺失，请重新同步 App 资源</body></html>";
        }
    }

    private void respond(Socket s, String contentType, String body) {
        try {
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            OutputStream out = s.getOutputStream();
            String head = "HTTP/1.1 200 OK\r\nContent-Type: " + contentType +
                    "\r\nContent-Length: " + data.length +
                    "\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
            out.write(head.getBytes(StandardCharsets.UTF_8));
            out.write(data);
            out.flush();
        } catch (IOException ignored) { }
    }
}
