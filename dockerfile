# Base image
FROM python:3.9-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs supervisor build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy both projects
COPY ./Automated-Question-Classify ./Automated-Question-classify
COPY ./latex-mcq ./latex-mcq

# Install Python dependencies
WORKDIR /app/Automated-Question-classify
RUN pip install -r requirements.txt

# Install Node dependencies
WORKDIR /app/latex-mcq
RUN npm install

# Create supervisord configuration
RUN echo '[supervisord]\n\
nodaemon=true\n\
\n\
[program:classifier-api]\n\
command=python -m uvicorn main:app --host 0.0.0.0 --port 8000\n\
directory=/app/Automated-Question-classify\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/classifier-api.err.log\n\
stdout_logfile=/var/log/classifier-api.out.log\n\
\n\
[program:latex-mcq]\n\
command=node server.js\n\
directory=/app/latex-mcq\n\
autostart=true\n\
autorestart=true\n\
stderr_logfile=/var/log/latex-mcq.err.log\n\
stdout_logfile=/var/log/latex-mcq.out.log' > /etc/supervisor/conf.d/supervisord.conf

# Copy docker-compose and other necessary files
COPY docker-compose.yml /app/
COPY .env /app/

# Expose necessary ports
EXPOSE 3000 8000 27017

# Start services using supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]