plugins { id("com.android.application") }

android {
    namespace = "dev.escape.brazil"
    compileSdk = 37
    defaultConfig {
        applicationId = "dev.escape.brazil"; minSdk = 26; targetSdk = 37
        versionCode = 1
        versionName = "0.4.0"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

// O jogo web (pasta acima de android/) é copiado para os assets antes de cada build.
val gameRoot = rootProject.projectDir.parentFile
val syncGame = tasks.register<Sync>("syncGame") {
    from(gameRoot) { include("index.html", "style.css", "*.js", "fonts/**") }
    into(file("src/main/assets/game"))
}
tasks.named("preBuild") { dependsOn(syncGame) }
