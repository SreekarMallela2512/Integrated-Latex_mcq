# Base image
FROM node:16-slim

# Install Python, pip and required tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy both projects
COPY ./Automated-Question-classify ./Automated-Question-classify
COPY ./latex-mcq ./latex-mcq

# Install Python dependencies for classifier
WORKDIR /app/Automated-Question-classify
RUN pip3 install --no-cache-dir -r requirements.txt

# Install Node dependencies for latex-mcq
WORKDIR /app/latex-mcq
RUN npm install

# Create start script equivalent to your bat file
RUN echo '#!/bin/bash\n\
echo "Starting MCQ Application Services..."\n\
\n\
# Start Classifier API\n\
cd /app/Automated-Question-classify\n\
uvicorn main:app --host 0.0.0.0 --port 8000 & \n\
\n\
# Wait 5 seconds\n\
sleep 5\n\
\n\
# Start LaTeX MCQ App\n\
cd /app/latex-mcq\n\
node server.js & \n\
\n\
echo "Services started!"\n\
echo "- Classifier API: http://localhost:8000"\n\
echo "- MCQ Application: http://localhost:3000"\n\
\n\
# Keep container running\n\
wait' > /app/start-services.sh

# Make the script executable
RUN chmod +x /app/start-services.sh

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