# Конфигурация лежит в образе, а не примонтирована с диска.
#
# Разворачивающая система клонирует репозиторий заново на каждый деплой, а
# контейнер пересоздаёт только когда меняется описание службы. Привязанный
# каталог после переклонирования указывает на удалённый inode: Grafana видит
# «нет такого каталога», а исправленный дашборд не доезжает никогда.
#
# Сборка снимает и то, и другое: изменился файл — изменился образ — контейнер
# пересоздан. Команда развёртывания и так `up -d --build`.

# Базовые образы тянутся через зеркало, а не напрямую с Docker Hub.
#
# За один день 2026-09-12 семь сборок из десяти упали на `registry-1.docker.io`:
# то отказ разрешения имени, то обрыв соединения, то ответ по IPv6, до которого
# с этого хоста не достучаться. Код был ни при чём ни разу.
#
# mirror.gcr.io — сквозной кэш Docker Hub, который держит Google: те же самые
# образы, тот же протокол. Значение вынесено в аргумент: вернуться на Docker Hub
# — это `--build-arg BASE_REGISTRY=docker.io` и ничего больше.
ARG BASE_REGISTRY=mirror.gcr.io

FROM ${BASE_REGISTRY}/grafana/grafana:11.5.1

COPY grafana-datasource.yml /etc/grafana/provisioning/datasources/prometheus.yml
COPY grafana-dashboard-provider.yml /etc/grafana/provisioning/dashboards/provider.yml
COPY dashboards/ /etc/grafana/provisioning/dashboards/burcev/
