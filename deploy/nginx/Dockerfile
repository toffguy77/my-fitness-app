# Nginx reverse proxy for burcev.team (prod) + new.burcev.team (dev)
FROM nginx:alpine

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy vhost configs
COPY new.burcev.team.conf /etc/nginx/conf.d/new.burcev.team.conf
COPY burcev.team.conf /etc/nginx/conf.d/burcev.team.conf

# Note: nginx -t not run at build — SSL certs are mounted on server at runtime

EXPOSE 80 443
