plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.iftin.resellers"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.iftin.resellers"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        val defaultApiBaseUrl = "https://bpkddmxpyeyxvjyebull.supabase.co/functions/v1/activate-package"
        val defaultAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwa2RkbXhweWV5eHZqeWVidWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTQ5NzEsImV4cCI6MjA5NjMzMDk3MX0.vHVvxVI2x87aWeiNlzwIoCqU1y-tNlvbc0j_PJcRuvk"
        val apiBaseUrl = providers.environmentVariable("DELIVERY_API_BASE_URL").orNull
            ?.takeIf { it.isNotBlank() } ?: defaultApiBaseUrl
        val anonKey = providers.environmentVariable("DELIVERY_ANON_KEY").orNull
            ?.takeIf { it.isNotBlank() } ?: defaultAnonKey
        buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        buildConfigField("String", "ANON_KEY", "\"${anonKey.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        vectorDrawables { useSupportLibrary = true }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
