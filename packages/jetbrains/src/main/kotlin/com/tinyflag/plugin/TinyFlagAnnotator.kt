package com.tinyflag.plugin

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiLiteralExpression

/**
 * Annotates flag name string literals with hover information showing
 * current state, rollout percentage, and description.
 */
class TinyFlagAnnotator : Annotator {

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        // Only process string literals
        if (element !is PsiLiteralExpression) return
        val value = element.value as? String ?: return

        val project = element.project
        val service = project.getService(TinyFlagService::class.java) ?: return
        val flag = service.getFlag(value) ?: return

        val status = if (flag.enabled) "✅ enabled" else "❌ disabled"
        val rollout = if (flag.rollout != null) " | rollout: ${flag.rollout}%" else ""
        val desc = if (flag.description != null) "\n${flag.description}" else ""
        val variants = if (flag.variants.isNotEmpty()) "\nvariants: ${flag.variants.joinToString(", ")}" else ""
        val tags = if (flag.tags.isNotEmpty()) "\ntags: ${flag.tags.joinToString(", ")}" else ""

        val tooltip = "TinyFlag: ${flag.name}\n$status$rollout$desc$variants$tags"

        holder.newAnnotation(HighlightSeverity.INFORMATION, "TinyFlag: ${flag.name} ($status)")
            .tooltip(tooltip)
            .create()
    }
}
