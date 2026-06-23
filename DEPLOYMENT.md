# 🚀 MediBlaze Deployment Guide

This guide covers different deployment options for MediBlaze AI Medical Assistant.

## 📋 Prerequisites

### Required API Keys:

1. **Google AI API Key** - Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **Pinecone API Key** - Get from [Pinecone Console](https://www.pinecone.io/)

### System Requirements:

- **Development**: Python 3.8+, 4GB RAM, 2GB disk space
- **Production**: 8GB RAM, 4GB disk space, Docker support

## 🏠 Local Development

### 1. Quick Setup

```bash
# Clone repository
git clone <repository-url>
cd __MEDIBLAZE

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Run application
python main.py
```

### 2. Access Application

- **Web Interface**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## 🐳 Docker Deployment

### Option 1: Docker Run

```bash
# Build image
docker build -t mediblaze .

# Run container
docker run -d \
  --name mediblaze-app \
  -p 8000:8000 \
  -e GOOGLE_API_KEY="your_google_key" \
  -e PINECONE_API_KEY="your_pinecone_key" \
  mediblaze
```

### Option 2: Docker Compose (Recommended)

```bash
# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Start services
docker-compose up -d

# View logs
docker-compose logs -f mediblaze

# Stop services
docker-compose down
```

## ☁️ Cloud Deployment

### AWS ECS/Fargate

```bash
# Build and tag image
docker build -t mediblaze .
docker tag mediblaze:latest your-account.dkr.ecr.region.amazonaws.com/mediblaze:latest

# Push to ECR
aws ecr get-login-password --region region | docker login --username AWS --password-stdin your-account.dkr.ecr.region.amazonaws.com
docker push your-account.dkr.ecr.region.amazonaws.com/mediblaze:latest

# Deploy using ECS task definition
```

### Google Cloud Run

```bash
# Build and push to Container Registry
gcloud builds submit --tag gcr.io/your-project/mediblaze

# Deploy to Cloud Run
gcloud run deploy mediblaze \
  --image gcr.io/your-project/mediblaze \
  --platform managed \
  --region us-central1 \
  --set-env-vars GOOGLE_API_KEY="your_key",PINECONE_API_KEY="your_key"
```

### Azure Container Instances

```bash
# Create resource group
az group create --name mediblaze-rg --location eastus

# Deploy container
az container create \
  --resource-group mediblaze-rg \
  --name mediblaze-app \
  --image your-registry/mediblaze:latest \
  --environment-variables GOOGLE_API_KEY="your_key" PINECONE_API_KEY="your_key" \
  --ports 8000
```

## 🔧 Production Configuration

### Environment Variables

```env
# Required
GOOGLE_API_KEY=your_google_ai_key
PINECONE_API_KEY=your_pinecone_key

# Optional Production Settings
PORT=8000
HOST=0.0.0.0
LOG_LEVEL=warning
WORKERS=4
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # For Server-Sent Events
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
}
```

### SSL/HTTPS with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 📊 Monitoring & Logging

### Health Checks

```bash
# Application health
curl http://localhost:8000/health

# Docker container health
docker ps
docker logs mediblaze-app
```

### Log Management

```yaml
# docker-compose.yml logging
services:
  mediblaze:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Monitoring with Prometheus

```yaml
# Add to docker-compose.yml
prometheus:
  image: prom/prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

## 🔒 Security Best Practices

### 1. Environment Security

- Use secrets management (AWS Secrets Manager, Azure Key Vault)
- Rotate API keys regularly
- Use environment-specific configurations

### 2. Network Security

- Use HTTPS in production
- Implement rate limiting
- Configure CORS properly
- Use VPN for internal access

### 3. Container Security

```dockerfile
# Use non-root user
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# Scan for vulnerabilities
docker scan mediblaze:latest
```

## 🚨 Troubleshooting

### Common Issues

#### 1. API Key Errors

```bash
# Check environment variables
docker exec mediblaze-app env | grep API_KEY

# Test API keys
curl -H "Authorization: Bearer $GOOGLE_API_KEY" https://generativelanguage.googleapis.com/v1/models
```

#### 2. Memory Issues

```bash
# Increase Docker memory
docker run --memory=2g mediblaze

# Monitor usage
docker stats mediblaze-app
```

#### 3. Port Conflicts

```bash
# Check port usage
netstat -tulpn | grep :8000

# Use different port
docker run -p 8080:8000 mediblaze
```

### Log Analysis

```bash
# Application logs
docker logs mediblaze-app --tail 100 -f

# System logs
journalctl -u docker.service -f
```

## 📈 Scaling

### Horizontal Scaling

```yaml
# docker-compose.yml
services:
  mediblaze:
    deploy:
      replicas: 3

  nginx:
    image: nginx
    # Load balancer configuration
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mediblaze
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mediblaze
  template:
    metadata:
      labels:
        app: mediblaze
    spec:
      containers:
        - name: mediblaze
          image: mediblaze:latest
          ports:
            - containerPort: 8000
          env:
            - name: GOOGLE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: mediblaze-secrets
                  key: google-api-key
```

## 🔄 Updates & Maintenance

### Rolling Updates

```bash
# Build new version
docker build -t mediblaze:v2.0 .

# Update with zero downtime
docker-compose up -d --no-deps mediblaze

# Rollback if needed
docker-compose up -d --no-deps mediblaze:v1.0
```

### Backup Strategy

```bash
# Backup configuration
tar -czf mediblaze-config-$(date +%Y%m%d).tar.gz .env docker-compose.yml

# Backup data (if using volumes)
docker run --rm -v mediblaze-data:/data -v $(pwd):/backup ubuntu tar czf /backup/data-backup.tar.gz /data
```

---

## 📞 Support

For deployment issues:

1. Check application logs
2. Verify API key configuration
3. Test health endpoints
4. Review Docker/system resources
5. Check network connectivity

**Emergency**: Ensure health check endpoints are monitored for critical deployments.
