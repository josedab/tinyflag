{{- define "tinyflag-operator.fullname" -}}
{{- printf "%s-%s" .Release.Name "tinyflag-operator" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tinyflag-operator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tinyflag-operator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
