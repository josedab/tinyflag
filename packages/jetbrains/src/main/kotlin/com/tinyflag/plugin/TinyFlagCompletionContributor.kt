package com.tinyflag.plugin

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext
import com.intellij.icons.AllIcons

/**
 * Provides flag name autocompletion in isEnabled() and getVariant() calls.
 */
class TinyFlagCompletionContributor : CompletionContributor() {

    init {
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            object : CompletionProvider<CompletionParameters>() {
                override fun addCompletions(
                    parameters: CompletionParameters,
                    context: ProcessingContext,
                    result: CompletionResultSet
                ) {
                    val project = parameters.position.project
                    val service = project.getService(TinyFlagService::class.java) ?: return

                    // Check if we're inside a string argument of isEnabled/getVariant/getConfig
                    val element = parameters.position
                    val text = element.parent?.parent?.text ?: ""
                    val methodPatterns = listOf("isEnabled", "getVariant", "getConfig", "evaluateWithPersona")

                    if (methodPatterns.none { text.contains(it) }) return

                    for (flag in service.getFlags().values) {
                        val icon = if (flag.enabled) AllIcons.Actions.Checked else AllIcons.Actions.Cancel
                        val detail = buildString {
                            if (flag.enabled) append("enabled") else append("disabled")
                            if (flag.rollout != null) append(" (${flag.rollout}%)")
                        }

                        result.addElement(
                            LookupElementBuilder.create(flag.name)
                                .withIcon(icon)
                                .withTypeText(detail)
                                .withTailText(if (flag.description != null) " — ${flag.description}" else "", true)
                        )
                    }
                }
            }
        )
    }
}
