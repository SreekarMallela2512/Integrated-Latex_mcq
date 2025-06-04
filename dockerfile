# Base image
FROM node:16-slim

# Install Python, pip and required tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    supervisor \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN python3 -m pip install --upgrade pip

WORKDIR /app

# Copy both projects
COPY ./Automated-Question-classify ./Automated-Question-classify
COPY ./latex-mcq ./latex-mcq

# Install Python dependencies for classifier
WORKDIR /app/Automated-Question-classify
# Install specific versions of packages
RUN pip3 install --no-cache-dir \
    fastapi==0.104.1 \
    langchain==0.0.335 \
    langchain-openai==0.0.2 \
    pydantic==2.4.2 \
    uvicorn==0.24.0

# Install Node dependencies for latex-mcq
WORKDIR /app/latex-mcq
RUN npm install

# Create supervisord configuration
RUN echo '[supervisord]\n\
nodaemon=true\n\
\n\
[program:classifier-api]\n\
command=uvicorn main:app --host 0.0.0.0 --port 8000\n\
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