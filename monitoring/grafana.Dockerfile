# Конфигурация лежит в образе, а не примонтирована с диска.
#
# Разворачивающая система клонирует репозиторий заново на каждый деплой, а
# контейнер пересоздаёт только когда меняется описание службы. Привязанный
# каталог после переклонирования указывает на удалённый inode: Grafana видит
# «нет такого каталога», а исправленный дашборд не доезжает никогда.
#
# Сборка снимает и то, и другое: изменился файл — изменился образ — контейнер
# пересоздан. Команда развёртывания и так `up -d --build`.

FROM grafana/grafana:11.5.1

COPY grafana-datasource.yml /etc/grafana/provisioning/datasources/prometheus.yml
COPY grafana-dashboard-provider.yml /etc/grafana/provisioning/dashboards/provider.yml
COPY dashboards/ /etc/grafana/provisioning/dashboards/burcev/
