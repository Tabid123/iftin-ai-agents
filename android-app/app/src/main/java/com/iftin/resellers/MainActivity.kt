package com.iftin.resellers

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.iftin.resellers.api.DeliveryApiClient
import com.iftin.resellers.service.DeliveryService
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private val permissionRequestCode = 870

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()

        setContent {
            MaterialTheme {
                IftinAgentScreen(
                    configured = DeliveryApiClient().isConfigured(),
                    isServiceRunning = { isDeliveryServiceRunning() },
                    onStart = { startAgent() },
                    onAccessibility = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                )
            }
        }
    }

    private fun startAgent() {
        val prefs = getSharedPreferences("agent", MODE_PRIVATE)
        if (prefs.getString("device_id", "").isNullOrBlank()) {
            prefs.edit().putString(
                "device_id",
                Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty(),
            ).apply()
        }
        ContextCompat.startForegroundService(this, Intent(this, DeliveryService::class.java))
    }

    private fun requestRuntimePermissions() {
        val wanted = mutableListOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        val missing = wanted.filter { ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), permissionRequestCode)
        else startAgent()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == permissionRequestCode) startAgent()
    }

    @Suppress("DEPRECATION")
    private fun isDeliveryServiceRunning(): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return manager.getRunningServices(Int.MAX_VALUE).any { it.service.className == DeliveryService::class.java.name }
    }
}

@Composable
private fun IftinAgentScreen(
    configured: Boolean,
    isServiceRunning: () -> Boolean,
    onStart: () -> Unit,
    onAccessibility: () -> Unit,
) {
    val context = LocalContext.current
    var running by remember { mutableStateOf(isServiceRunning()) }
    var total by remember { mutableIntStateOf(0) }
    var success by remember { mutableIntStateOf(0) }
    var failed by remember { mutableIntStateOf(0) }
    var pending by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            running = isServiceRunning()
            val p = context.getSharedPreferences("iftin_agent_stats", Context.MODE_PRIVATE)
            total = p.getInt("total", 0)
            success = p.getInt("success", 0)
            failed = p.getInt("failed", 0)
            pending = p.getInt("pending", 0)
            delay(2000)
        }
    }

    val brand = Color(0xFF003082)
    Column(
        modifier = Modifier.fillMaxSize().background(Color(0xFFF5F6F8))
    ) {
        Surface(modifier = Modifier.fillMaxWidth(), color = brand, shadowElevation = 4.dp) {
            Column(modifier = Modifier.statusBarsPadding().padding(horizontal = 24.dp, vertical = 18.dp)) {
                Text("IFTIN AGENTS", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(12.dp).background(if (running) Color(0xFF00E676) else Color(0xFFFF5252), CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text(if (running) "ALWAYS ON ♾️" else "RESTARTING...", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Total", total, brand, Modifier.weight(1f))
                StatCard("Success", success, Color(0xFF00A651), Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Failed", failed, Color(0xFFD32F2F), Modifier.weight(1f))
                StatCard("Pending", pending, Color(0xFFF59E0B), Modifier.weight(1f))
            }

            Spacer(Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = if (running) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)),
            ) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (running) "✅" else "🔄", fontSize = 24.sp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(if (running) "Service Running" else "Service Restarting", fontWeight = FontWeight.Bold)
                        Text("USSD automation runs automatically 24/7", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            Button(onClick = onStart, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(12.dp)) {
                Text("START / RESTART DELIVERY AGENT")
            }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = onAccessibility, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(12.dp)) {
                Text("ENABLE USSD ACCESSIBILITY SERVICE")
            }

            Spacer(Modifier.height(16.dp))
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("📱 Delivery Agent", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = brand)
                    Spacer(Modifier.height(8.dp))
                    Text("Backend: ${if (configured) "Configured" else "Not configured"}")
                    Text("Flows: *870* • *866* • *101* • *212*")
                    Text("Customer/reseller APK-ga waa ka gooni; app-kan ayaa SIM + USSD automation qabta.", fontSize = 13.sp, color = Color.DarkGray)
                }
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: Int, color: Color, modifier: Modifier = Modifier) {
    Card(modifier = modifier, shape = RoundedCornerShape(12.dp), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontSize = 14.sp, color = Color.Gray)
            Spacer(Modifier.height(6.dp))
            Text(value.toString(), fontSize = 30.sp, fontWeight = FontWeight.Bold, color = color)
        }
    }
}