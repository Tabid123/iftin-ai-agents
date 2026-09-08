package com.iftin.delivery

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.iftin.delivery.api.DeliveryApiClient
import com.iftin.delivery.service.DeliveryService

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("agent", MODE_PRIVATE)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 64, 40, 40)
        }
        val title = TextView(this).apply {
            text = "Iftin Delivery Agent"
            textSize = 24f
        }
        val status = TextView(this).apply {
            text = if (DeliveryApiClient().isConfigured()) "Backend: configured" else "Backend: DELIVERY_API_BASE_URL / DELIVERY_ANON_KEY missing"
            textSize = 14f
        }
        val deviceInput = EditText(this).apply {
            hint = "Device ID (must match android_devices)"
            setText(prefs.getString("device_id", ""))
            isSingleLine = true
        }
        val save = Button(this).apply {
            text = "Save Device ID & Start"
            setOnClickListener {
                prefs.edit().putString("device_id", deviceInput.text.toString().trim()).apply()
                requestRuntimePermissions()
                ContextCompat.startForegroundService(this@MainActivity, Intent(this@MainActivity, DeliveryService::class.java))
                status.text = "Agent started. Enable Accessibility below."
            }
        }
        val accessibility = Button(this).apply {
            text = "Enable USSD Accessibility"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
        val help = TextView(this).apply {
            text = "Supported flows: *870*, *866*, *101*, *212*.\nThe customer/reseller APK is separate; only this agent needs CALL_PHONE + Accessibility."
            textSize = 14f
        }

        listOf(title, status, deviceInput, save, accessibility, help).forEach(layout::addView)
        setContentView(layout)
        requestRuntimePermissions()
    }

    private fun requestRuntimePermissions() {
        val wanted = mutableListOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        val missing = wanted.filter { ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 870)
    }
}
