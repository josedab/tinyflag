package com.tinyflag.plugin

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import org.yaml.snakeyaml.Yaml
import java.io.StringReader

/**
 * Project-level service that loads and caches flag definitions from YAML files.
 */
@Service(Service.Level.PROJECT)
class TinyFlagService(private val project: Project) {

    data class FlagInfo(
        val name: String,
        val enabled: Boolean,
        val description: String?,
        val rollout: Int?,
        val tags: List<String>,
        val variants: List<String>,
        val filePath: String
    )

    private var flags: Map<String, FlagInfo> = emptyMap()
    private var lastModified: Long = 0

    fun getFlags(): Map<String, FlagInfo> {
        refreshIfNeeded()
        return flags
    }

    fun getFlag(name: String): FlagInfo? {
        refreshIfNeeded()
        return flags[name]
    }

    fun getFlagNames(): List<String> {
        refreshIfNeeded()
        return flags.keys.sorted()
    }

    private fun refreshIfNeeded() {
        val flagFiles = findFlagFiles()
        val currentModified = flagFiles.maxOfOrNull { it.modificationStamp } ?: 0
        if (currentModified != lastModified) {
            reloadFlags(flagFiles)
            lastModified = currentModified
        }
    }

    private fun findFlagFiles(): List<VirtualFile> {
        val baseDir = project.basePath ?: return emptyList()
        val result = mutableListOf<VirtualFile>()
        val patterns = listOf("flags.yml", "flags.yaml", "flags.json")

        fun scanDir(dir: VirtualFile) {
            for (child in dir.children) {
                if (child.isDirectory && child.name != "node_modules" && child.name != ".git") {
                    scanDir(child)
                } else if (patterns.any { child.name == it }) {
                    result.add(child)
                }
            }
        }

        val root = com.intellij.openapi.vfs.LocalFileSystem.getInstance().findFileByPath(baseDir)
        if (root != null) scanDir(root)
        return result
    }

    @Suppress("UNCHECKED_CAST")
    private fun reloadFlags(files: List<VirtualFile>) {
        val yaml = Yaml()
        val newFlags = mutableMapOf<String, FlagInfo>()

        for (file in files) {
            try {
                val content = String(file.contentsToByteArray())
                val doc = yaml.load<Map<String, Any>>(StringReader(content)) ?: continue
                val flagsMap = doc["flags"] as? Map<String, Map<String, Any>> ?: continue

                for ((name, def) in flagsMap) {
                    val enabled = def["enabled"] as? Boolean ?: false
                    val description = def["description"] as? String
                    val rollout = (def["rollout"] as? Number)?.toInt()
                    val tags = (def["tags"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
                    val variants = (def["variants"] as? List<Map<String, Any>>)
                        ?.mapNotNull { it["name"] as? String } ?: emptyList()

                    newFlags[name] = FlagInfo(
                        name = name,
                        enabled = enabled,
                        description = description,
                        rollout = rollout,
                        tags = tags,
                        variants = variants,
                        filePath = file.path
                    )
                }
            } catch (_: Exception) {
                // Skip unparseable files
            }
        }

        flags = newFlags
    }
}
