package com.iftin.resellers

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import com.iftin.resellers.auth.AuthRepository

class SplashActivity : ComponentActivity() {

    companion object {
        private const val SPLASH_DELAY_MS = 1500L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        Handler(Looper.getMainLooper()).postDelayed({
            val auth = AuthRepository(applicationContext)
            val next = if (auth.isLoggedIn()) {
                Intent(this, MainActivity::class.java)
            } else {
                Intent(this, LoginActivity::class.java)
            }
            startActivity(next)
            finish()
            @Suppress("DEPRECATION")
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                overrideActivityTransition(
                    OVERRIDE_TRANSITION_CLOSE,
                    android.R.anim.fade_in,
                    android.R.anim.fade_out
                )
            } else {
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            }
        }, SPLASH_DELAY_MS)
    }
}
