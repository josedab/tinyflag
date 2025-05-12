plugins {
    id("com.android.library") version "8.2.0"
    id("org.jetbrains.kotlin.android") version "2.1.20"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.20"
    id("maven-publish")
}

android {
    namespace = "io.tinyflag"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
}

publishing {
    publications {
        register<MavenPublication>("release") {
            groupId = "io.tinyflag"
            artifactId = "tinyflag-android"
            version = "0.1.0"

            pom {
                name.set("TinyFlag Android SDK")
                description.set("Feature flag SDK for Android with offline evaluation and background sync")
                url.set("https://github.com/josedab/tinyflag")
                licenses { license { name.set("MIT") } }
            }
        }
    }
}
