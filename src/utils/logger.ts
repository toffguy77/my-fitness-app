/**
 * Система логирования с поддержкой разных уровней
 * Поддерживает как клиентскую, так и серверную среду
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

type LogContext = {
    [key: string]: unknown;
};

class Logger {
    private level: LogLevel;
    private isDevelopment: boolean;
    private isClient: boolean;
    private isDebugMode: boolean;
    private enableUserFlowLogging: boolean;

    constructor() {
        // Определяем среду выполнения
        this.isClient = typeof window !== 'undefined';
        this.isDevelopment = process.env.NODE_ENV === 'development';

        // Получаем уровень логирования из переменных окружения
        const envLevel = this.isClient
            ? process.env.NEXT_PUBLIC_LOG_LEVEL
            : process.env.LOG_LEVEL;

        // По умолчанию: DEBUG в development, INFO в production
        const defaultLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;

        this.level = this.parseLogLevel(envLevel) ?? defaultLevel;

        // Проверяем debug режим (детальное логирование для отладки первых пользователей)
        const debugMode = this.isClient
            ? process.env.NEXT_PUBLIC_DEBUG_MODE === 'true'
            : process.env.DEBUG_MODE === 'true';
        this.isDebugMode = debugMode || this.isDevelopment;

        // Включаем логирование flow пользователя если включен debug режим
        this.enableUserFlowLogging = this.isDebugMode || 
            (this.isClient ? process.env.NEXT_PUBLIC_ENABLE_USER_FLOW_LOGGING === 'true' 
                          : process.env.ENABLE_USER_FLOW_LOGGING === 'true');
    }

    private parseLogLevel(level?: string): LogLevel | null {
        if (!level) return null;

        const upperLevel = level.toUpperCase();
        switch (upperLevel) {
            case 'DEBUG':
                return LogLevel.DEBUG;
            case 'INFO':
                return LogLevel.INFO;
            case 'WARN':
                return LogLevel.WARN;
            case 'ERROR':
                return LogLevel.ERROR;
            case 'NONE':
                return LogLevel.NONE;
            default:
                return null;
        }
    }

    private formatMessage(level: string, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.level;
    }

    private log(level: LogLevel, levelName: string, message: string, context?: LogContext, error?: Error): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(levelName, message, context);
        const logData: unknown[] = [formattedMessage];

        if (error) {
            logData.push(error);
        }

        // ВАЖНО: Для серверной среды всегда пишем в stdout/stderr для Docker
        // Это гарантирует, что логи видны в контейнере
        // В Edge Runtime (middleware) process.stdout/stderr недоступны, используем только console
        // Проверяем, что мы не в Edge Runtime через проверку доступности process
        const isNodeRuntime = !this.isClient && typeof process !== 'undefined' && 
                              'stdout' in process && 'stderr' in process &&
                              typeof (process as any).stdout?.write === 'function';
        
        if (isNodeRuntime) {
            // Для Node.js серверной среды используем process.stdout/stderr напрямую
            // чтобы гарантировать попадание логов в Docker
            const logLine = formattedMessage + (error ? `\nError: ${error.stack || error.message}` : '');
            
            try {
                const stdout = (process as any).stdout;
                const stderr = (process as any).stderr;
                
                switch (level) {
                    case LogLevel.DEBUG:
                        stdout.write(`DEBUG: ${logLine}\n`);
                        console.debug(...logData);
                        break;
                    case LogLevel.INFO:
                        stdout.write(`INFO: ${logLine}\n`);
                        console.info(...logData);
                        break;
                    case LogLevel.WARN:
                        stderr.write(`WARN: ${logLine}\n`);
                        console.warn(...logData);
                        break;
                    case LogLevel.ERROR:
                        stderr.write(`ERROR: ${logLine}\n`);
                        console.error(...logData);
                        break;
                }
            } catch {
                // Если запись в stdout/stderr не удалась, используем только console
                switch (level) {
                    case LogLevel.DEBUG:
                        console.debug(...logData);
                        break;
                    case LogLevel.INFO:
                        console.info(...logData);
                        break;
                    case LogLevel.WARN:
                        console.warn(...logData);
                        break;
                    case LogLevel.ERROR:
                        console.error(...logData);
                        break;
                }
            }
        } else {
            // Для клиентской среды используем обычные методы консоли
            switch (level) {
                case LogLevel.DEBUG:
                    console.debug(...logData);
                    break;
                case LogLevel.INFO:
                    console.info(...logData);
                    break;
                case LogLevel.WARN:
                    console.warn(...logData);
                    break;
                case LogLevel.ERROR:
                    console.error(...logData);
                    break;
            }
        }
    }

    /**
     * Логирование отладочной информации
     * Используется для детальной отладки приложения
     */
    debug(message: string, context?: LogContext): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, context);
    }

    /**
     * Детальное логирование flow пользователя (регистрация, авторизация, действия)
     * Логируется только если включен debug режим или ENABLE_USER_FLOW_LOGGING
     */
    userFlow(action: string, context?: LogContext): void {
        if (this.enableUserFlowLogging) {
            this.log(LogLevel.DEBUG, 'USER_FLOW', `[User Flow] ${action}`, context);
        }
    }

    /**
     * Логирование регистрации пользователя
     * ВАЖНО: Всегда логируется в production для отладки проблем пользователей
     */
    registration(action: string, context?: LogContext): void {
        // Всегда логируем регистрацию (критически важно для отладки)
        this.log(LogLevel.INFO, 'REGISTRATION', `[Registration] ${action}`, context);
        
        // Дополнительно пишем в stdout для Docker (Node.js серверная среда, если доступно)
        if (!this.isClient && typeof process !== 'undefined' && 
            'stdout' in process && typeof (process as any).stdout?.write === 'function') {
            try {
                const contextStr = context ? ` ${JSON.stringify(context)}` : '';
                (process as any).stdout.write(`[REGISTRATION] ${action}${contextStr}\n`);
            } catch {
                // Ignore if stdout is not available (Edge Runtime)
            }
        }
    }

    /**
     * Логирование авторизации пользователя
     * ВАЖНО: Всегда логируется в production для отладки проблем пользователей
     */
    authentication(action: string, context?: LogContext): void {
        // Всегда логируем авторизацию (критически важно для отладки)
        this.log(LogLevel.INFO, 'AUTH', `[Auth] ${action}`, context);
        
        // Дополнительно пишем в stdout для Docker (Node.js серверная среда, если доступно)
        if (!this.isClient && typeof process !== 'undefined' && 
            'stdout' in process && typeof (process as any).stdout?.write === 'function') {
            try {
                const contextStr = context ? ` ${JSON.stringify(context)}` : '';
                (process as any).stdout.write(`[AUTH] ${action}${contextStr}\n`);
            } catch {
                // Ignore if stdout is not available (Edge Runtime)
            }
        }
    }

    /**
     * Логирование действий пользователя в приложении
     */
    userAction(action: string, context?: LogContext): void {
        if (this.enableUserFlowLogging) {
            this.log(LogLevel.DEBUG, 'USER_ACTION', `[User Action] ${action}`, context);
        }
    }

    /**
     * Проверка включен ли debug режим
     */
    isDebugEnabled(): boolean {
        return this.isDebugMode;
    }

    /**
     * Проверка включено ли логирование flow пользователя
     */
    isUserFlowLoggingEnabled(): boolean {
        return this.enableUserFlowLogging;
    }

    /**
     * Логирование информационных сообщений
     * Используется для отслеживания нормального потока выполнения
     */
    info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, 'INFO', message, context);
    }

    /**
     * Логирование предупреждений
     * Используется для ситуаций, которые могут привести к проблемам
     */
    warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, 'WARN', message, context);
    }

    /**
     * Логирование ошибок
     * Используется для критических ошибок и исключений
     */
    error(message: string, error?: Error | unknown, context?: LogContext): void {
        // Record error metrics
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { metricsCollector } = require('./metrics/collector')
            const errorType = error instanceof Error ? error.constructor.name : 'unknown'
            const errorCode = (error as any)?.code || (error as any)?.status || 'unknown'
            const severity = this.isCriticalError(error) ? 'critical' : 'warning'
            
            metricsCollector.counter(
                'errors_total',
                'Total number of errors',
                {
                    type: this.getErrorType(message, error),
                    error_code: String(errorCode),
                    severity,
                }
            )

            if (severity === 'critical') {
                metricsCollector.counter(
                    'errors_critical_total',
                    'Total number of critical errors',
                    {
                        type: this.getErrorType(message, error),
                    }
                )
            }
        } catch {
            // Ignore metrics errors to prevent infinite loops
        }
        let errorObj: Error | undefined;

        if (error instanceof Error) {
            errorObj = error;
        } else if (error) {
            // Обрабатываем объекты ошибок (например, из Supabase)
            if (typeof error === 'object' && error !== null) {
                try {
                    const errorMessage = 'message' in error && typeof error.message === 'string' 
                        ? error.message 
                        : JSON.stringify(error);
                    errorObj = new Error(errorMessage);
                    // Копируем дополнительные свойства если они есть
                    if ('code' in error) {
                        (errorObj as any).code = error.code;
                    }
                    if ('details' in error) {
                        (errorObj as any).details = error.details;
                    }
                } catch {
                    errorObj = new Error('Unknown error');
                }
            } else {
                errorObj = new Error(String(error));
            }
        }

        this.log(LogLevel.ERROR, 'ERROR', message, context, errorObj);
        
        // ВАЖНО: Всегда пишем ошибки в stderr для Docker (Node.js серверная среда, если доступно)
        // Это гарантирует, что ошибки видны в логах контейнера
        if (!this.isClient && typeof process !== 'undefined' && 
            'stderr' in process && typeof (process as any).stderr?.write === 'function') {
            try {
                const contextStr = context ? ` ${JSON.stringify(context)}` : '';
                const errorStr = errorObj ? `\nError: ${errorObj.stack || errorObj.message}` : '';
                (process as any).stderr.write(`[ERROR] ${message}${contextStr}${errorStr}\n`);
            } catch {
                // Ignore if stderr is not available (Edge Runtime)
            }
        }
    }

    /**
     * Создает дочерний логгер с дополнительным контекстом
     * Полезно для логирования в определенных модулях или компонентах
     */
    child(context: LogContext): Logger {
        const childLogger = new Logger();
        const originalLog = childLogger.log.bind(childLogger);

        childLogger.log = (level: LogLevel, levelName: string, message: string, childContext?: LogContext, error?: Error) => {
            const mergedContext = { ...context, ...childContext };
            originalLog(level, levelName, message, mergedContext, error);
        };

        return childLogger;
    }

    /**
     * Получить текущий уровень логирования
     */
    getLevel(): LogLevel {
        return this.level;
    }

    /**
     * Установить уровень логирования программно
     */
    setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * Determine if error is critical
     */
    private isCriticalError(error?: Error | unknown): boolean {
        if (!error) return false;
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return message.includes('critical') || 
                   message.includes('fatal') || 
                   message.includes('database') ||
                   message.includes('connection') ||
                   message.includes('environment');
        }
        return false;
    }

    /**
     * Get error type from message and error
     */
    private getErrorType(message: string, error?: Error | unknown): string {
        const msg = message.toLowerCase();
        
        if (msg.includes('auth') || msg.includes('session') || msg.includes('login')) {
            return 'auth';
        }
        if (msg.includes('database') || msg.includes('supabase') || msg.includes('pg')) {
            return 'database';
        }
        if (msg.includes('validation') || msg.includes('invalid')) {
            return 'validation';
        }
        if (msg.includes('middleware')) {
            return 'middleware';
        }
        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                return 'network';
            }
        }
        
        return 'unknown';
    }
}

// Экспортируем singleton экземпляр
export const logger = new Logger();

// Экспортируем класс для создания кастомных логгеров
export { Logger };



