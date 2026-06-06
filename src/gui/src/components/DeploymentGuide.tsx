import React, { useState } from 'react';
import '../styles/DeploymentGuide.css';

export const DeploymentGuide: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('quick-start');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const sections = [
    { id: 'quick-start', label: 'Quick Start' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'installation', label: 'Installation' },
    { id: 'configuration', label: 'Configuration' },
    { id: 'verification', label: 'Verification' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
    { id: 'monitoring', label: 'Monitoring' },
    { id: 'security', label: 'Security' },
    { id: 'faq', label: 'FAQ' }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'quick-start':
        return (
          <div className="guide-content">
            <h2>Quick Start</h2>
            <div className="section-box">
              <h3>🚀 Get Started in 2 Minutes</h3>
              <p>The fastest way to run FlashDB using Docker:</p>
              <pre className="code-block">
{`cd c:\\flashdb
docker-compose -f docker-compose.full-stack.yml up -d

# Access the application
Frontend: http://localhost:3000
API: http://localhost:3001`}
              </pre>
            </div>
            <div className="section-box">
              <h3>✅ Verify Installation</h3>
              <pre className="code-block">
{`# Check all services are running
docker ps

# Test API health
curl http://localhost:3001/health

# Open browser
http://localhost:3000`}
              </pre>
            </div>
          </div>
        );

      case 'requirements':
        return (
          <div className="guide-content">
            <h2>System Requirements</h2>
            <div className="section-box">
              <h3>⚙️ Minimum Requirements</h3>
              <ul>
                <li><strong>RAM:</strong> 4GB minimum (8GB recommended)</li>
                <li><strong>Storage:</strong> 10GB free disk space</li>
                <li><strong>CPU:</strong> 2 cores minimum (4+ recommended)</li>
                <li><strong>OS:</strong> Windows 10+, macOS, or Linux</li>
              </ul>
            </div>
            <div className="section-box">
              <h3>🐳 Docker Requirements</h3>
              <ul>
                <li><strong>Docker:</strong> v20.10 or later</li>
                <li><strong>Docker Compose:</strong> v1.29 or later</li>
                <li><strong>Available Ports:</strong> 3000, 3001, 1434</li>
                <li><strong>Network:</strong> Stable internet connection</li>
              </ul>
            </div>
            <div className="section-box">
              <h3>💻 Local Installation</h3>
              <ul>
                <li><strong>Node.js:</strong> v16.0.0 or later</li>
                <li><strong>npm:</strong> v8.0.0 or later</li>
                <li><strong>SQL Server:</strong> 2019 or later</li>
                <li><strong>PowerShell:</strong> v5.1 or later (Windows)</li>
              </ul>
            </div>
          </div>
        );

      case 'installation':
        return (
          <div className="guide-content">
            <h2>Installation Guide</h2>
            <div className="section-box">
              <h3>🐳 Docker Installation (Recommended)</h3>
              <ol>
                <li>Install Docker Desktop: https://www.docker.com/products/docker-desktop</li>
                <li>Clone FlashDB repository</li>
                <li>Run: <code>docker-compose -f docker-compose.full-stack.yml up -d</code></li>
                <li>Wait 30 seconds for initialization</li>
                <li>Access: http://localhost:3000</li>
              </ol>
            </div>
            <div className="section-box">
              <h3>💻 Local Installation</h3>
              <ol>
                <li>Install SQL Server 2019 Express or later</li>
                <li>Install Node.js v16.0.0+</li>
                <li>Install PowerShell Module:
                  <pre className="code-block">Copy-Item -Path .\src\FlashDB -Destination "C:\Program Files\PowerShell\Modules\" -Recurse</pre>
                </li>
                <li>Install npm dependencies:
                  <pre className="code-block">cd src/api && npm install</pre>
                </li>
                <li>Start services in separate terminals</li>
              </ol>
            </div>
          </div>
        );

      case 'configuration':
        return (
          <div className="guide-content">
            <h2>Configuration</h2>
            <div className="section-box">
              <h3>🔐 Environment Variables</h3>
              <p>Create <code>.env</code> file in project root:</p>
              <pre className="code-block">
{`# API Configuration
API_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Security
JWT_SECRET=your-secret-key-here
JWT_EXPIRY_HOURS=24
BCRYPT_ROUNDS=10

# Database
DB_HOST=sql-server
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourPassword123

# Instance
INSTANCE_ID=api-primary-001
INSTANCE_ROLE=primary`}
              </pre>
            </div>
            <div className="section-box">
              <h3>⚡ Docker Compose Configuration</h3>
              <p>Edit <code>docker-compose.full-stack.yml</code> to customize:</p>
              <ul>
                <li>Port mappings (default: 3000, 3001, 1434)</li>
                <li>Database passwords</li>
                <li>Environment variables</li>
                <li>Volume persistence</li>
                <li>Resource limits</li>
              </ul>
            </div>
          </div>
        );

      case 'verification':
        return (
          <div className="guide-content">
            <h2>Verification Checklist</h2>
            <div className="section-box">
              <h3>✅ Health Checks</h3>
              <ul>
                <li>
                  <strong>API Health:</strong>
                  <code>curl http://localhost:3001/health</code>
                </li>
                <li>
                  <strong>Frontend:</strong> http://localhost:3000 (should load)
                </li>
                <li>
                  <strong>Database:</strong> Check docker logs for connection status
                </li>
              </ul>
            </div>
            <div className="section-box">
              <h3>🧪 Test Operations</h3>
              <ol>
                <li>Open Frontend: http://localhost:3000</li>
                <li>Click "Metrics Dashboard" tab</li>
                <li>Verify metrics are loading</li>
                <li>Click "Management" tab</li>
                <li>Create a golden image (if database is accessible)</li>
              </ol>
            </div>
          </div>
        );

      case 'troubleshooting':
        return (
          <div className="guide-content">
            <h2>Troubleshooting</h2>
            <div className="section-box">
              <h3>🔴 Port Already in Use</h3>
              <p>If port 3000, 3001, or 1434 is already in use:</p>
              <pre className="code-block">
{`# Windows (find and kill process)
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3001
kill -9 <PID>`}
              </pre>
            </div>
            <div className="section-box">
              <h3>🔴 Database Connection Failed</h3>
              <ul>
                <li>Check SQL Server is running: <code>docker ps | grep sql-server</code></li>
                <li>Verify credentials in .env file</li>
                <li>Check docker logs: <code>docker logs flashdb-sql-server</code></li>
                <li>Wait 30 seconds for SQL Server initialization</li>
              </ul>
            </div>
            <div className="section-box">
              <h3>🔴 API Not Responding</h3>
              <ul>
                <li>Check API logs: <code>docker logs flashdb-api</code></li>
                <li>Restart API: <code>docker restart flashdb-api</code></li>
                <li>Verify health: <code>curl http://localhost:3001/health</code></li>
              </ul>
            </div>
            <div className="section-box">
              <h3>🔴 GUI Not Loading</h3>
              <ul>
                <li>Clear browser cache (Ctrl+Shift+Del)</li>
                <li>Hard refresh (Ctrl+Shift+R)</li>
                <li>Check GUI logs: <code>docker logs flashdb-gui</code></li>
                <li>Verify connection: <code>curl http://localhost:3000</code></li>
              </ul>
            </div>
          </div>
        );

      case 'monitoring':
        return (
          <div className="guide-content">
            <h2>Monitoring & Maintenance</h2>
            <div className="section-box">
              <h3>📊 Health Monitoring</h3>
              <ul>
                <li>
                  <strong>Liveness:</strong> <code>curl http://localhost:3001/live</code> (is service running?)
                </li>
                <li>
                  <strong>Readiness:</strong> <code>curl http://localhost:3001/ready</code> (is service ready?)
                </li>
                <li>
                  <strong>Full Health:</strong> <code>curl http://localhost:3001/health</code>
                </li>
              </ul>
            </div>
            <div className="section-box">
              <h3>📈 Metrics Collection</h3>
              <ul>
                <li><strong>Pool Metrics:</strong> /api/metrics/pool</li>
                <li><strong>Queue Metrics:</strong> /api/metrics/queue</li>
                <li><strong>Overview:</strong> /api/metrics/overview</li>
              </ul>
            </div>
            <div className="section-box">
              <h3>📝 Logs</h3>
              <pre className="code-block">
{`# View real-time logs
docker logs -f flashdb-api

# View specific service logs
docker logs flashdb-gui
docker logs flashdb-sql-server

# Export logs
docker logs flashdb-api > logs-export.txt`}
              </pre>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="guide-content">
            <h2>Security Best Practices</h2>
            <div className="section-box">
              <h3>🔐 Change Default Passwords</h3>
              <p>Before production deployment, change:</p>
              <ul>
                <li>Database password (SA_PASSWORD)</li>
                <li>JWT_SECRET (use strong random string)</li>
                <li>API credentials</li>
              </ul>
            </div>
            <div className="section-box">
              <h3>🔐 Generate JWT Secret</h3>
              <pre className="code-block">
{`# macOS/Linux
openssl rand -base64 32

# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Maximum 256)}))`}
              </pre>
            </div>
            <div className="section-box">
              <h3>🔐 Enable HTTPS</h3>
              <p>In production, always use HTTPS:</p>
              <ul>
                <li>Obtain SSL/TLS certificate</li>
                <li>Configure Docker to use certificate</li>
                <li>Update firewall rules for HTTPS port (443)</li>
              </ul>
            </div>
            <div className="section-box">
              <h3>🔐 Firewall Configuration</h3>
              <p>Open only necessary ports:</p>
              <ul>
                <li>3000 (Frontend) - Public</li>
                <li>3001 (API) - Public or restricted IP</li>
                <li>1433 (Database) - Internal only</li>
              </ul>
            </div>
          </div>
        );

      case 'faq':
        return (
          <div className="guide-content">
            <h2>Frequently Asked Questions</h2>
            {[
              {
                q: 'How do I update FlashDB?',
                a: 'Pull latest code, rebuild Docker images, and restart services.'
              },
              {
                q: 'Can I run multiple instances?',
                a: 'Yes! FlashDB supports multi-instance deployment. See docker-compose-multi.yml for setup.'
              },
              {
                q: 'How do I backup my data?',
                a: 'Use database backup commands or export volumes. See Monitoring section for details.'
              },
              {
                q: 'What are the performance limits?',
                a: 'Single instance handles 100s of concurrent clones. Multi-instance for higher throughput.'
              },
              {
                q: 'Can I use external SQL Server?',
                a: 'Yes! Update DB_HOST in .env to point to your SQL Server instance.'
              },
              {
                q: 'How do I scale the system?',
                a: 'Use docker-compose-multi.yml for multi-instance or Kubernetes for enterprise.'
              }
            ].map((faq, idx) => (
              <div key={idx} className="faq-item">
                <div
                  className="faq-question"
                  onClick={() => setExpandedFAQ(expandedFAQ === idx.toString() ? null : idx.toString())}
                >
                  <span className="faq-icon">{expandedFAQ === idx.toString() ? '▼' : '▶'}</span>
                  <strong>Q: {faq.q}</strong>
                </div>
                {expandedFAQ === idx.toString() && (
                  <div className="faq-answer">
                    <p><strong>A:</strong> {faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="deployment-guide">
      <div className="guide-header">
        <h1>📚 FlashDB Deployment Guide</h1>
        <p>Complete guide to install, configure, and manage FlashDB v1.0.0</p>
      </div>

      <div className="guide-container">
        <div className="guide-sidebar">
          <div className="section-nav">
            {sections.map(section => (
              <button
                key={section.id}
                className={`nav-button ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className="guide-main">
          {renderContent()}
        </div>
      </div>

      <div className="guide-footer">
        <p>📖 For detailed information, see DEPLOYMENT.md in the project root</p>
        <p>🆘 Need help? Check the Troubleshooting section or GitHub Issues</p>
      </div>
    </div>
  );
};

export default DeploymentGuide;
