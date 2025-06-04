FROM python:3.9-slim

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy both projects
COPY Automated-Question-classify/ ./Automated-Question-classify/
COPY latex-mcq/ ./latex-mcq/

# Install Python dependencies
WORKDIR /app/Automated-Question-classify
RUN pip install -r requirements.txt

# Install Node dependencies
WORKDIR /app/latex-mcq
RUN npm install

# Create startup script
RUN echo '#!/bin/bash\n\
cd /app/Automated-Question-classify && python -m uvicorn main:app --host 0.0.0.0 --port 8000 &\n\
cd /app/latex-mcq && node server.js' > /app/start.sh && \
chmod +x /app/start.sh

EXPOSE 3000 8000

CMD ["/app/start.sh"]