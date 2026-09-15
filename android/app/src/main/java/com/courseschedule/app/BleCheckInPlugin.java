package com.courseschedule.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.Build;
import android.os.ParcelUuid;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@CapacitorPlugin(
    name = "BleCheckIn",
    permissions = {
        @Permission(strings = { android.Manifest.permission.BLUETOOTH_ADVERTISE }, alias = "advertise"),
        @Permission(strings = { android.Manifest.permission.BLUETOOTH_CONNECT }, alias = "connect")
    }
)
public class BleCheckInPlugin extends Plugin {

    public static final UUID SERVICE_UUID = UUID.fromString("5f6d7a81-9b3c-4d2e-8a1f-0c5b4e3d2f10");
    public static final UUID CHAR_UUID = UUID.fromString("5f6d7a82-9b3c-4d2e-8a1f-0c5b4e3d2f10");

    private BluetoothGattServer gattServer;
    private BluetoothLeAdvertiser advertiser;
    private boolean advertising = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        BluetoothAdapter adapter = getAdapter();
        ret.put("available", adapter != null);
        ret.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        BluetoothManager bm = getManager();
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) { call.reject("此设备不支持蓝牙"); return; }
        if (!adapter.isEnabled()) { call.reject("蓝牙未开启，请先在系统设置中打开蓝牙"); return; }
        if (Build.VERSION.SDK_INT >= 31 &&
            (!hasPermission(android.Manifest.permission.BLUETOOTH_ADVERTISE) ||
             !hasPermission(android.Manifest.permission.BLUETOOTH_CONNECT))) {
            requestPermissionForAliases(new String[] { "advertise", "connect" }, call, "startAfterPerms");
            return;
        }
        try {
            startGattServer(bm);
            startAdvertising(adapter, call);
        } catch (SecurityException e) {
            call.reject("缺少蓝牙权限：" + e.getMessage());
        } catch (Exception e) {
            call.reject("启动失败：" + e.getMessage());
        }
    }

    @PermissionCallback
    private void startAfterPerms(PluginCall call) {
        start(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAll();
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private BluetoothManager getManager() {
        return (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
    }

    private BluetoothAdapter getAdapter() {
        BluetoothManager bm = getManager();
        return bm == null ? null : bm.getAdapter();
    }

    private void startGattServer(BluetoothManager bm) {
        if (gattServer != null) return;
        gattServer = bm.openGattServer(getContext(), new BluetoothGattServerCallback() {
            @Override
            public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                    BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                    boolean responseNeeded, int offset, byte[] value) {
                if (responseNeeded && gattServer != null) {
                    try {
                        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, value);
                    } catch (SecurityException ignored) { }
                }
                if (value == null || value.length == 0) return;
                String payload = new String(value, StandardCharsets.UTF_8).trim();
                if (payload.isEmpty() || payload.length() > 200) return;
                String name = payload;
                String id = "";
                int sep = payload.indexOf('|');
                if (sep >= 0) {
                    name = payload.substring(0, sep).trim();
                    id = payload.substring(sep + 1).trim();
                }
                JSObject data = new JSObject();
                data.put("name", name);
                data.put("id", id);
                data.put("mac", device.getAddress());
                notifyListeners("checkin", data);
            }
        });
        BluetoothGattService service = new BluetoothGattService(SERVICE_UUID,
                BluetoothGattService.SERVICE_TYPE_PRIMARY);
        BluetoothGattCharacteristic ch = new BluetoothGattCharacteristic(CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE);
        ch.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        service.addCharacteristic(ch);
        gattServer.addService(service);
    }

    private void startAdvertising(BluetoothAdapter adapter, final PluginCall call) {
        if (advertiser == null) advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) { call.reject("此设备不支持蓝牙广播"); return; }

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build();
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(new ParcelUuid(SERVICE_UUID))
                .build();
        AdvertiseData scanResp = new AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build();

        advertiser.startAdvertising(settings, data, scanResp, new AdvertiseCallback() {
            @Override
            public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                advertising = true;
                JSObject ret = new JSObject();
                ret.put("advertising", true);
                call.resolve(ret);
            }

            @Override
            public void onStartFailure(int errorCode) {
                advertising = false;
                call.reject("广播启动失败（错误码 " + errorCode + "），请检查蓝牙是否开启");
            }
        });
    }

    private void stopAll() {
        try {
            if (advertiser != null && advertising) {
                advertiser.stopAdvertising(advertiseCallback);
                advertising = false;
            }
        } catch (Exception ignored) { }
        try {
            if (gattServer != null) {
                gattServer.clearServices();
                gattServer.close();
            }
        } catch (Exception ignored) { }
        gattServer = null;
        advertiser = null;
    }

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() { };
}
