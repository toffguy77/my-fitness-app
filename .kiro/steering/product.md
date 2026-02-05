# Product Overview

BURCEV is a Freemium SaaS fitness and nutrition tracking platform designed for clients working with fitness trainers and nutritionists.

## Core Purpose

Digital nutrition diary with KBЖУ tracking (calories, protein, fat, carbs), trainer collaboration features, and progress visualization.

## Key Features

**Free Tier:**
- Daily nutrition logging with multiple meals
- Weight tracking
- Basic dashboard with weekly summary
- Automatic BMR/TDEE calculation
- Data validation
- Notification system (personal and content notifications)

**Premium Tier:**
- Trainer collaboration (notes, feedback, real-time chat)
- Advanced reports and analytics
- Progress charts (weight, macros)
- Data export (CSV, JSON, PDF)
- OCR label recognition
- Achievement system
- Product database with autocomplete
- Priority notifications and alerts

## Implemented Features

### Notifications System (Phase 7 - COMPLETED)
- **Two notification categories:**
  - Main (Основные): Personal notifications (trainer feedback, achievements, reminders)
  - Content (Контент): System-wide notifications (updates, new features, announcements)
- **Real-time updates:** 30-second polling for new notifications
- **Smart interactions:**
  - Auto-mark as read after 2 seconds of viewing
  - Optimistic UI updates with rollback on failure
  - Unread badge counts per category
- **Responsive design:** Mobile-first with tablet and desktop optimizations
- **Accessibility:** Full keyboard navigation, WCAG 2.1 compliant
- **Performance:** Infinite scroll, virtual scrolling for large lists
- **Testing:** 266 tests with 95%+ coverage (unit, property-based, integration)

## User Roles

- **Client**: End users tracking nutrition (Free or Premium)
- **Coach**: Trainers monitoring client progress, providing feedback
- **Super Admin**: Platform administrators managing users and subscriptions

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend**: Go (Gin framework) + PostgreSQL on Yandex.Cloud
- **Infrastructure**: Docker, nginx

## Current Status

Version 4.0+ with Phases 1-7 implemented (95% complete). Production-ready with active deployment on burcev.team.
