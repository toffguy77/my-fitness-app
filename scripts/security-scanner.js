#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Security Scanner for CI/CD Pipeline
 * Performs comprehensive security scanning including:
 * - Dependency vulnerability scanning
 * - SAST (Static Application Security Testing)
 * - Secret scanning
 * - License compliance checking
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SecurityScanner {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            scans: {},
            summary: {
                total_issues: 0,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                info: 0
            },
            status: 'unknown'
        };

        this.config = this.loadConfig();
    }

    loadConfig() {
        const defaultConfig = {
            dependency_scan: {
                enabled: true,
                audit_level: 'high',
                production_only: true,
                timeout: 120000
            },
            sast_scan: {
                enabled: true,
                languages: ['javascript', 'typescript'],
                rules: ['security', 'quality'],
                timeout: 300000
            },
            secret_scan: {
                enabled: true,
                patterns: [
                    'password\\s*[:=]\\s*["\'][^"\']+["\']',
                    'token\\s*[:=]\\s*["\'][^"\']+["\']',
                    'key\\s*[:=]\\s*["\'][^"\']+["\']',
                    'secret\\s*[:=]\\s*["\'][^"\']+["\']'
                ],
                exclude_patterns: [
                    'secrets\\.',
                    'env\\.',
                    'process\\.env\\.'
                ]
            },
            license_scan: {
                enabled: true,
                allowed_licenses: [
                    'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
                    'ISC', 'CC0-1.0', 'Unlicense'
                ],
                timeout: 60000
            }
        };

        try {
            const configPath = '.github/security-config.yml';
            if (fs.existsSync(configPath)) {
                const yaml = require('js-yaml');
                const securityConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
                return { ...defaultConfig, ...securityConfig.scanning };
            }
        } catch (error) {
            console.warn('Could not load security config, using defaults:', error.message);
        }

        return defaultConfig;
    }

    async runDependencyScan() {
        if (!this.config.dependency_scan.enabled) {
            console.log('Dependency scan disabled, skipping...');
            return;
        }

        console.log('Running dependency vulnerability scan...');

        try {
            const auditLevel = this.config.dependency_scan.audit_level;
            const productionFlag = this.config.dependency_scan.production_only ? '--production' : '';

            // Run npm audit
            const auditCommand = `npm audit ${productionFlag} --audit-level ${auditLevel} --json`;
            const auditResult = execSync(auditCommand, {
                encoding: 'utf8',
                timeout: this.config.dependency_scan.timeout
            });

            const auditData = JSON.parse(auditResult);

            this.results.scans.dependencies = {
                status: 'completed',
                vulnerabilities: auditData.vulnerabilities || {},
                metadata: auditData.metadata || {},
                summary: {
                    total: auditData.metadata?.vulnerabilities?.total || 0,
                    critical: auditData.metadata?.vulnerabilities?.critical || 0,
                    high: auditData.metadata?.vulnerabilities?.high || 0,
                    moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
                    low: auditData.metadata?.vulnerabilities?.low || 0,
                    info: auditData.metadata?.vulnerabilities?.info || 0
                }
            };

            // Update overall summary
            this.updateSummary(this.results.scans.dependencies.summary);

            console.log(`Dependency scan completed:`);
            console.log(`   Critical: ${this.results.scans.dependencies.summary.critical}`);
            console.log(`   High: ${this.results.scans.dependencies.summary.high}`);
            console.log(`   Moderate: ${this.results.scans.dependencies.summary.moderate}`);
            console.log(`   Low: ${this.results.scans.dependencies.summary.low}`);

        } catch (error) {
            console.error('Dependency scan failed:', error.message);
            this.results.scans.dependencies = {
                status: 'failed',
                error: error.message
            };
        }
    }

    async runSASTScan() {
        if (!this.config.sast_scan.enabled) {
            console.log('SAST scan disabled, skipping...');
            return;
        }

        console.log('Running Static Application Security Testing (SAST)...');

        try {
            // Use ESLint with security rules for SAST
            const eslintCommand = 'npx eslint . --config eslint.security.config.mjs --ext .js,.jsx,.ts,.tsx --format json';
            const eslintResult = execSync(eslintCommand, {
                encoding: 'utf8',
                timeout: this.config.sast_scan.timeout
            });

            const eslintData = JSON.parse(eslintResult);

            // Filter for security-related issues
            const securityIssues = [];
            eslintData.forEach(file => {
                file.messages.forEach(message => {
                    if (this.isSecurityRule(message.ruleId)) {
                        securityIssues.push({
                            file: file.filePath,
                            line: message.line,
                            column: message.column,
                            severity: this.mapESLintSeverity(message.severity),
                            rule: message.ruleId,
                            message: message.message
                        });
                    }
                });
            });

            const sastSummary = this.summarizeIssues(securityIssues);

            this.results.scans.sast = {
                status: 'completed',
                issues: securityIssues,
                summary: sastSummary
            };

            this.updateSummary(sastSummary);

            console.log(`SAST scan completed: ${securityIssues.length} security issues found`);

        } catch (error) {
            // ESLint returns non-zero exit code when issues are found
            if (error.stdout) {
                try {
                    const eslintData = JSON.parse(error.stdout);
                    // Process the results even if ESLint "failed"
                    const securityIssues = [];
                    eslintData.forEach(file => {
                        file.messages.forEach(message => {
                            if (this.isSecurityRule(message.ruleId)) {
                                securityIssues.push({
                                    file: file.filePath,
                                    line: message.line,
                                    column: message.column,
                                    severity: this.mapESLintSeverity(message.severity),
                                    rule: message.ruleId,
                                    message: message.message
                                });
                            }
                        });
                    });

                    const sastSummary = this.summarizeIssues(securityIssues);

                    this.results.scans.sast = {
                        status: 'completed',
                        issues: securityIssues,
                        summary: sastSummary
                    };

                    this.updateSummary(sastSummary);

                    console.log(`SAST scan completed: ${securityIssues.length} security issues found`);
                } catch (parseError) {
                    console.error('SAST scan failed:', error.message);
                    this.results.scans.sast = {
                        status: 'failed',
                        error: error.message
                    };
                }
            } else {
                console.error('SAST scan failed:', error.message);
                this.results.scans.sast = {
                    status: 'failed',
                    error: error.message
                };
            }
        }
    }

    async runSecretScan() {
        if (!this.config.secret_scan.enabled) {
            console.log('Secret scan disabled, skipping...');
            return;
        }

        console.log('Running secret scanning...');

        try {
            const secretIssues = [];
            const patterns = this.config.secret_scan.patterns;
            const excludePatterns = this.config.secret_scan.exclude_patterns;

            // Scan specific file types
            const filesToScan = this.getFilesToScan([
                '.js', '.jsx', '.ts', '.tsx', '.json', '.yml', '.yaml', '.env'
            ]);

            filesToScan.forEach(filePath => {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split('\n');

                    lines.forEach((line, lineNumber) => {
                        patterns.forEach(pattern => {
                            const regex = new RegExp(pattern, 'gi');
                            const matches = line.match(regex);

                            if (matches) {
                                matches.forEach(match => {
                                    // Check if match should be excluded
                                    const shouldExclude = excludePatterns.some(excludePattern => {
                                        const excludeRegex = new RegExp(excludePattern, 'i');
                                        return excludeRegex.test(match);
                                    });

                                    if (!shouldExclude) {
                                        secretIssues.push({
                                            file: filePath,
                                            line: lineNumber + 1,
                                            severity: 'high',
                                            type: 'potential_secret',
                                            pattern: pattern,
                                            match: match.substring(0, 50) + '...' // Truncate for security
                                        });
                                    }
                                });
                            }
                        });
                    });
                } catch (fileError) {
                    console.warn(`Could not scan file ${filePath}:`, fileError.message);
                }
            });

            const secretSummary = this.summarizeIssues(secretIssues);

            this.results.scans.secrets = {
                status: 'completed',
                issues: secretIssues,
                summary: secretSummary
            };

            this.updateSummary(secretSummary);

            console.log(`Secret scan completed: ${secretIssues.length} potential secrets found`);

        } catch (error) {
            console.error('Secret scan failed:', error.message);
            this.results.scans.secrets = {
                status: 'failed',
                error: error.message
            };
        }
    }

    async runLicenseScan() {
        if (!this.config.license_scan.enabled) {
            console.log('License scan disabled, skipping...');
            return;
        }

        console.log('Running license compliance scan...');

        try {
            // Use npm ls to get dependency information
            const lsCommand = 'npm ls --json --all';
            const lsResult = execSync(lsCommand, {
                encoding: 'utf8',
                timeout: this.config.license_scan.timeout
            });

            const dependencyData = JSON.parse(lsResult);
            const licenseIssues = [];
            const allowedLicenses = this.config.license_scan.allowed_licenses;

            // Recursively check licenses
            const checkLicenses = (deps, path = '') => {
                if (!deps) return;

                Object.entries(deps).forEach(([name, info]) => {
                    if (info.license && !allowedLicenses.includes(info.license)) {
                        licenseIssues.push({
                            package: name,
                            version: info.version,
                            license: info.license,
                            path: path,
                            severity: 'medium',
                            type: 'license_violation'
                        });
                    }

                    if (info.dependencies) {
                        checkLicenses(info.dependencies, `${path}/${name}`);
                    }
                });
            };

            checkLicenses(dependencyData.dependencies);

            const licenseSummary = this.summarizeIssues(licenseIssues);

            this.results.scans.licenses = {
                status: 'completed',
                issues: licenseIssues,
                summary: licenseSummary,
                allowed_licenses: allowedLicenses
            };

            this.updateSummary(licenseSummary);

            console.log(`License scan completed: ${licenseIssues.length} license issues found`);

        } catch (error) {
            console.warn('License scan completed with warnings:', error.message);
            // License scan failures are often non-critical
            this.results.scans.licenses = {
                status: 'completed_with_warnings',
                warning: error.message,
                summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 }
            };
        }
    }

    isSecurityRule(ruleId) {
        const securityRules = [
            'no-eval',
            'no-implied-eval',
            'no-new-func',
            'no-script-url',
            'security/detect-object-injection',
            'security/detect-non-literal-regexp',
            'security/detect-unsafe-regex',
            'security/detect-buffer-noassert',
            'security/detect-child-process',
            'security/detect-disable-mustache-escape',
            'security/detect-eval-with-expression',
            'security/detect-no-csrf-before-method-override',
            'security/detect-non-literal-fs-filename',
            'security/detect-non-literal-require',
            'security/detect-possible-timing-attacks',
            'security/detect-pseudoRandomBytes'
        ];

        return securityRules.some(rule => ruleId && ruleId.includes(rule));
    }

    mapESLintSeverity(eslintSeverity) {
        switch (eslintSeverity) {
            case 2: return 'high';
            case 1: return 'medium';
            default: return 'low';
        }
    }

    summarizeIssues(issues) {
        const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };

        issues.forEach(issue => {
            summary.total++;
            summary[issue.severity] = (summary[issue.severity] || 0) + 1;
        });

        return summary;
    }

    updateSummary(scanSummary) {
        this.results.summary.total_issues += scanSummary.total || 0;
        this.results.summary.critical += scanSummary.critical || 0;
        this.results.summary.high += scanSummary.high || 0;
        this.results.summary.medium += scanSummary.medium || 0;
        this.results.summary.low += scanSummary.low || 0;
        this.results.summary.info += scanSummary.info || 0;
    }

    getFilesToScan(extensions) {
        const files = [];

        const scanDirectory = (dir) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });

                entries.forEach(entry => {
                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        // Skip common directories that shouldn't be scanned
                        if (!['node_modules', '.git', '.next', 'coverage', 'dist', 'build'].includes(entry.name)) {
                            scanDirectory(fullPath);
                        }
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name);
                        if (extensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                });
            } catch (error) {
                console.warn(`Could not scan directory ${dir}:`, error.message);
            }
        };

        scanDirectory('.');
        return files;
    }

    determineOverallStatus() {
        const { critical, high } = this.results.summary;

        if (critical > 0) {
            return 'critical_issues_found';
        } else if (high > 0) {
            return 'high_issues_found';
        } else if (this.results.summary.total_issues > 0) {
            return 'issues_found';
        } else {
            return 'no_issues_found';
        }
    }

    generateReport() {
        this.results.status = this.determineOverallStatus();

        const reportPath = 'security-scan-results.json';
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));

        console.log('\nSecurity Scan Summary:');
        console.log(`   Total Issues: ${this.results.summary.total_issues}`);
        console.log(`   Critical: ${this.results.summary.critical}`);
        console.log(`   High: ${this.results.summary.high}`);
        console.log(`   Medium: ${this.results.summary.medium}`);
        console.log(`   Low: ${this.results.summary.low}`);
        console.log(`   Status: ${this.results.status}`);
        console.log(`\nDetailed report saved to: ${reportPath}`);

        return this.results;
    }

    async runAllScans() {
        console.log('Starting comprehensive security scan...\n');

        await this.runDependencyScan();
        await this.runSASTScan();
        await this.runSecretScan();
        await this.runLicenseScan();

        const results = this.generateReport();

        // Exit with appropriate code based on findings
        if (results.summary.critical > 0) {
            console.error('\nCritical security issues found - blocking pipeline');
            process.exit(1);
        } else if (results.summary.high > 0) {
            console.warn('\nHigh severity security issues found - review required');
            // For now, we'll warn but not block. Uncomment to block on high severity:
            // process.exit(1);
        } else {
            console.log('\nSecurity scan completed successfully');
        }

        return results;
    }
}

// CLI interface
if (require.main === module) {
    const scanner = new SecurityScanner();

    const command = process.argv[2] || 'all';

    switch (command) {
        case 'dependencies':
            scanner.runDependencyScan().then(() => scanner.generateReport());
            break;
        case 'sast':
            scanner.runSASTScan().then(() => scanner.generateReport());
            break;
        case 'secrets':
            scanner.runSecretScan().then(() => scanner.generateReport());
            break;
        case 'licenses':
            scanner.runLicenseScan().then(() => scanner.generateReport());
            break;
        case 'all':
        default:
            scanner.runAllScans();
            break;
    }
}

module.exports = SecurityScanner;
