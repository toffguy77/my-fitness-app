# Nginx reverse proxy for new.burcev.team
FROM nginx:alpine

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy our vhost config
COPY new.burcev.team.conf /etc/nginx/conf.d/default.conf

# Ensure config is valid
RUN nginx -t

EXPOSE 80 443
