plugins {
    kotlin("jvm") version "2.1.20"
    `maven-publish`
    `java-library`
}

group = "io.tinyflag"
version = "0.1.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("com.google.code.gson:gson:2.11.0")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
}

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(21)
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            artifactId = "tinyflag"
            pom {
                name.set("TinyFlag JVM SDK")
                description.set("Zero-dependency feature flag evaluator for Java and Kotlin")
                url.set("https://github.com/tinyflag/tinyflag")
                licenses {
                    license {
                        name.set("MIT")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }
            }
        }
    }
}
