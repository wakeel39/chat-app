{{/*
Expand the name of the chart.
*/}}
{{- define "chat-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "chat-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "chat-app.labels" -}}
helm.sh/chart: {{ include "chat-app.chart" . }}
app.kubernetes.io/name: {{ include "chat-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ required "image.tag is required (use values-application-kind.yaml or values-application-eks.yaml)" .Values.image.tag | quote }}
{{- end }}

{{/*
Full image for app (repository/tag supplied via Argo CD valueFiles overlays)
*/}}
{{- define "chat-app.image" -}}
{{- $repo := required "image.repository is required (use values-application-kind.yaml or values-application-eks.yaml)" .Values.image.repository }}
{{- $tag := required "image.tag is required (use values-application-kind.yaml or values-application-eks.yaml)" .Values.image.tag }}
{{- printf "%s:%s" $repo $tag }}
{{- end }}
