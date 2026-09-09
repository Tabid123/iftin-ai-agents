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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.iftin.resellers.api.DeliveryApiClient
import com.iftin.resellers.service.DeliveryService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val PREFS = "agent"
private const val KEY_DEVICE_ID = "device_id"
private const val KEY_TENANT_ID = "tenant_id"
private const val KEY_ACCOUNT_EMAIL = "account_email"
private const val KEY_DEVICE_NAME = "device_name"

class MainActivity : ComponentActivity() {
    private val permissionRequestCode = 870
    private val api = DeliveryApiClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureDeviceId()

        setContent {
            MaterialTheme {
                var signedInEmail by remember { mutableStateOf(currentAccountEmail()) }

                if (signedInEmail == null) {
                    LoginScreen(
                        configured = api.isConfigured(),
                        deviceId = ensureDeviceId(),
                        defaultDeviceName = prefs().getString(KEY_DEVICE_NAME, null)
                            ?: "${Build.MANUFACTURER} ${Build.MODEL}",
                        onSubmit = { email, password, deviceName ->
                            val result = api.registerDevice(ensureDeviceId(), deviceName, email, password)
                            if (result.success) {
                                prefs().edit()
                                    .putString(KEY_TENANT_ID, result.tenantId.orEmpty())
                                    .putString(KEY_ACCOUNT_EMAIL, email.trim())
                                    .putString(KEY_DEVICE_NAME, deviceName)
                                    .apply()
                                requestRuntimePermissions()
                                signedInEmail = email.trim()
                            }
                            result.errorMessage
                        },
                    )
                } else {
                    LaunchedEffect(Unit) { requestRuntimePermissions() }
                    IftinAgentScreen(
                        configured = api.isConfigured(),
                        accountEmail = signedInEmail.orEmpty(),
                        isServiceRunning = { isDeliveryServiceRunning() },
                        onStart = { startAgent() },
                        onAccessibility = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                        onSignOut = {
                            signOut()
                            signedInEmail = null
                        },
                    )
                }
            }
        }
    }

    private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)

    private fun currentAccountEmail(): String? =
        prefs().getString(KEY_ACCOUNT_EMAIL, null)?.takeIf { it.isNotBlank() }

    private fun ensureDeviceId(): String {
        val stored = prefs().getString(KEY_DEVICE_ID, "").orEmpty()
        if (stored.isNotBlank()) return stored
        val generated = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
        prefs().edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }

    private fun signOut() {
        stopService(Intent(this, DeliveryService::class.java))
        // Device identity stays so the same phone re-binds to the same tenant.
        prefs().edit().remove(KEY_ACCOUNT_EMAIL).remove(KEY_TENANT_ID).apply()
    }

    private fun startAgent() {
        if (currentAccountEmail() == null) return
        ensureDeviceId()
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
private fun LoginScreen(
    configured: Boolean,
    deviceId: String,
    defaultDeviceName: String,
    onSubmit: suspend (email: String, password: String, deviceName: String) -> String?,
) {
    val brand = Color(0xFF003082)
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(brand)
            .statusBarsPadding()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier.size(84.dp).background(Color.White.copy(alpha = 0.14f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("IA", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(18.dp))
            Text("IFTIN AGENTS", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(28.dp))

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                color = Color.White,
                shadowElevation = 8.dp,
            ) {
                Column(Modifier.padding(22.dp)) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it; error = null },
                        label = { Text("Email") },
                        singleLine = true,
                        enabled = !loading,
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(14.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = null },
                        label = { Text("Password") },
                        singleLine = true,
                        enabled = !loading,
                        shape = RoundedCornerShape(12.dp),
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (error != null) {
                        Spacer(Modifier.height(12.dp))
                        Text(error.orEmpty(), color = Color(0xFFD32F2F), fontSize = 13.sp)
                    }

                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = {
                            if (email.isBlank() || password.isBlank()) {
                                error = "Email iyo password waa loo baahan yahay"
                                return@Button
                            }
                            loading = true
                            error = null
                            scope.launch {
                                val message = onSubmit(
                                    email,
                                    password,
                                    defaultDeviceName.ifBlank { "Android Device" },
                                )
                                loading = false
                                error = message
                            }
                        },
                        enabled = !loading,
                        colors = ButtonDefaults.buttonColors(containerColor = brand),
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (loading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(10.dp))
                            Text("Fadlan sug...")
                        } else {
                            Text("GAL", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
}

@Composable
private fun IftinAgentScreen(
    configured: Boolean,
    accountEmail: String,
    isServiceRunning: () -> Boolean,
    onStart: () -> Unit,
    onAccessibility: () -> Unit,
    onSignOut: () -> Unit,
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
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F6F8))
            .verticalScroll(rememberScrollState()),
    ) {
        Surface(modifier = Modifier.fillMaxWidth(), color = brand, shadowElevation = 4.dp) {
            Column(modifier = Modifier.statusBarsPadding().padding(horizontal = 24.dp, vertical = 18.dp)) {
                Text("IFTIN AGENTS", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(accountEmail, color = Color(0xFFD6E0F5), fontSize = 13.sp)
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
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD32F2F)),
            ) {
                Text("KA BAX (LOG OUT)")
            }

            Spacer(Modifier.height(16.dp))
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("📱 Delivery Agent", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = brand)
                    Spacer(Modifier.height(8.dp))
                    Text("Akoon: $accountEmail", fontSize = 13.sp)
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
