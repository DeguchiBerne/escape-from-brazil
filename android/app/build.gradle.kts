plugins { id("com.android.application") }

android {
    namespace = "dev.escape.brazil"
    compileSdk = 37
    defaultConfig {
        applicationId = "dev.escape.brazil"; minSdk = 26; targetSdk = 37
        // A versão vem de core.js (const VERSION = 'x.y.z'), a mesma que o HTML mostra.
        val version = Regex("""VERSION = '(\d+)\.(\d+)\.(\d+)'""").find(rootProject.projectDir.parentFile.resolve("core.js").readText())!!.groupValues
        versionName = "${version[1]}.${version[2]}.${version[3]}"
        versionCode = version[1].toInt() * 10000 + version[2].toInt() * 100 + version[3].toInt()
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

// O jogo web (pasta acima de android/) é copiado para os assets antes de cada build.
val gameRoot = rootProject.projectDir.parentFile
val syncGame = tasks.register<Sync>("syncGame") {
    from(gameRoot) { include("index.html", "style.css", "*.js", "fonts/**", "classico-*/**") }
    into(file("src/main/assets/game"))
}
tasks.named("preBuild") { dependsOn(syncGame) }
