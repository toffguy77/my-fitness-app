# Конфигурация в образе по той же причине, что и у Grafana: привязка к
# клонированному каталогу переживает деплой, а её содержимое — нет.
#
# Для Prometheus это важнее: правило оповещения, которое не доехало, выглядит
# точно как правило, которому не о чем сообщить.

FROM prom/prometheus:v3.1.0

COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY alerts.yml /etc/prometheus/alerts.yml
