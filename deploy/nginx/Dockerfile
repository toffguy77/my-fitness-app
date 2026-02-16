# Nginx reverse proxy for new.burcev.team
FROM nginx:alpine

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy our vhost config
COPY new.burcev.team.conf /etc/nginx/conf.d/default.conf

# Note: nginx -t not run at build — SSL certs are mounted on server at runtime

EXPOSE 80 443
