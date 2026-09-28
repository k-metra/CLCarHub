# 🚗 CL CarHub — Car Rental Management System

> A custom-built car rental management platform developed specifically for **CL CarHub**, a real-world vehicle rental business.

**CL CarHub** is a dedicated web-based management system created to support the day-to-day operations of the CL CarHub car rental business. Rather than being a generic rental software product, the system is designed around **CL CarHub's actual fleet, customers, reservations, rental operations, and business workflows**.

The platform provides CL CarHub with a centralized system for managing its vehicles, customers, reservations, rentals, payments, maintenance records, and operational data.

---

## 🏢 About CL CarHub

**CL CarHub** is a vehicle rental business that provides customers with access to rental vehicles for personal, business, travel, and other transportation needs.

This system was developed specifically for CL CarHub to help digitize and centralize its rental operations.

Instead of relying on disconnected spreadsheets, messaging applications, paper records, and manually maintained information, CL CarHub can use the platform as a **single source of truth for its rental operations**.

### The system is built around CL CarHub's business needs, including:

* Managing CL CarHub's vehicle fleet
* Tracking vehicle availability
* Managing customer information
* Handling rental reservations
* Recording active and completed rentals
* Tracking payments and deposits
* Managing vehicle maintenance
* Monitoring business activity
* Generating operational reports

---

## 🎯 Purpose of the System

The primary purpose of the CL CarHub system is to **digitize and streamline the actual operations of the CL CarHub rental business**.

The system aims to reduce manual administrative work while giving CL CarHub staff a centralized platform where important rental information can be accessed and managed.

```text
                    CL CARHUB
                       │
          ┌────────────┴────────────┐
          │                         │
       Business                  Customers
       Operations                   │
          │                         │
    ┌─────┴─────┐             Reservations
    │            │                   │
  Fleet       Rentals                │
    │            │                   │
Maintenance   Payments ──────────────┘
    │
    └────────── Reports & Analytics
```

---

## ✨ Core Features

### 🚘 Fleet Management

A centralized system for managing the vehicles that make up the **CL CarHub fleet**.

* Vehicle profiles
* Make and model
* Year and variant
* Plate number
* Vehicle images
* Rental rates
* Availability status
* Current rental status
* Maintenance status
* Vehicle history

### 📅 Reservation Management

Manage customer reservations throughout their entire lifecycle.

* Create reservations
* View reservation details
* Customer assignment
* Vehicle assignment
* Pickup date and time
* Return date and time
* Rental duration
* Reservation status
* Reservation notes
* Cancellation records

### 👤 Customer Management

Maintain a centralized record of customers who rent vehicles from CL CarHub.

* Customer profiles
* Contact information
* Identification details
* Driver's license information
* Rental history
* Current rentals
* Previous reservations
* Customer notes

### 🚗 Rental Management

Manage the actual rental process after a reservation has been confirmed.

* Rental records
* Vehicle assignment
* Rental start and end dates
* Pickup and return information
* Rental agreements
* Security deposits
* Additional charges
* Rental status
* Vehicle return processing

### 💰 Payment Management

Track financial transactions associated with CL CarHub rentals.

* Rental payments
* Security deposits
* Additional charges
* Discounts
* Outstanding balances
* Payment status
* Transaction history
* Rental totals

### 🔧 Vehicle Maintenance

Keep track of the maintenance and service history of CL CarHub vehicles.

* Maintenance records
* Service dates
* Maintenance type
* Service costs
* Mileage
* Maintenance notes
* Vehicle maintenance status
* Service history

### 📊 Business Dashboard

Provide CL CarHub staff with an overview of current rental operations.

The dashboard can display information such as:

* Active rentals
* Upcoming reservations
* Available vehicles
* Currently rented vehicles
* Vehicles under maintenance
* Recent reservations
* Payment activity
* Revenue information
* Fleet utilization

---

# 👥 User Roles

The system supports role-based access so that CL CarHub personnel can access the features relevant to their responsibilities.

Possible roles include:

### Administrator

Full access to the CL CarHub management system.

### Rental Staff

Manage customers, reservations, rentals, and day-to-day rental operations.

### Fleet Manager

Manage vehicles, availability, maintenance, and fleet-related information.

### Finance / Accounting

Manage payments, deposits, balances, and financial records.

> Roles and permissions can be adjusted according to CL CarHub's actual organizational structure and operational requirements.

---

# 🖥️ System Modules

```text
CL CarHub
│
├── Dashboard
│
├── Reservations
│   ├── All Reservations
│   ├── Pending
│   ├── Confirmed
│   ├── Active
│   ├── Completed
│   └── Cancelled
│
├── Fleet
│   ├── Vehicles
│   ├── Availability
│   └── Maintenance
│
├── Customers
│   ├── Customer Directory
│   └── Rental History
│
├── Rentals
│   ├── Active Rentals
│   ├── Rental Agreements
│   └── Returns
│
├── Payments
│   ├── Transactions
│   ├── Deposits
│   └── Outstanding Balances
│
├── Reports
│   ├── Revenue
│   ├── Rentals
│   ├── Fleet
│   └── Customers
│
└── Settings
    ├── Users
    ├── Roles & Permissions
    └── System Configuration
```

---

# 🎨 CL CarHub Design

The entire interface is designed around the **CL CarHub brand identity**.

### Color Palette

* **Black** — primary UI and background color
* **Orange** — primary brand accent and interactive elements
* **White / neutral tones** — content, readability, and contrast

The visual design uses a modern automotive aesthetic while keeping the system practical for everyday business use.

The interface is designed to feel like **CL CarHub's own internal platform**, rather than a generic third-party rental application.

---

# 🛠️ Technology Stack

The system is built using modern web technologies.

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router

### Backend

* Laravel
* PHP
* RESTful API

### Database

* MySQL / MariaDB

### Infrastructure

* Linux
* Nginx
* PHP-FPM
* Node.js
* HTTPS / SSL

### Development

* Git
* GitHub
* npm
* Composer
* Visual Studio Code

---

# 🏗️ System Architecture

```text
┌────────────────────────────────────┐
│            CL CarHub Staff         │
│                                    │
│     Admin • Staff • Fleet • Finance│
└──────────────────┬─────────────────┘
                   │
                   ▼
┌────────────────────────────────────┐
│          CL CarHub Web App         │
│                                    │
│       React + TypeScript + Vite    │
└──────────────────┬─────────────────┘
                   │
                   │ REST API
                   ▼
┌────────────────────────────────────┐
│        CL CarHub Backend           │
│                                    │
│            Laravel / PHP           │
│                                    │
│ Authentication                     │
│ Authorization                      │
│ Business Logic                     │
│ Validation                         │
│ Rental Management                  │
└──────────────────┬─────────────────┘
                   │
                   ▼
┌────────────────────────────────────┐
│        CL CarHub Database          │
│                                    │
│           MySQL / MariaDB          │
└────────────────────────────────────┘
```

---

# 🔐 Security

Because the system contains **real business and customer information belonging to CL CarHub**, security is an important consideration.

The application incorporates security practices such as:

* Authentication
* Role-based authorization
* Password hashing
* Request validation
* API authentication
* Secure environment variables
* HTTPS in production
* Database access restrictions
* File upload validation
* Audit logging where applicable
* Session security

Sensitive credentials and production configuration must never be committed to the repository.

---

# 📦 Installation

## Requirements

* Node.js
* npm
* PHP
* Composer
* MySQL / MariaDB
* Git

Clone the repository:

```bash
git clone <REPOSITORY_URL>
cd cl-carhub
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

Configure the database credentials in `.env`, then run:

```bash
php artisan migrate
php artisan db:seed
```

Start the Laravel development server:

```bash
php artisan serve
```

---

# 🚀 Production Deployment

The CL CarHub system can be deployed to a Linux VPS using a production web stack such as:

```text
Internet
    │
    ▼
  Nginx
    │
    ├── CL CarHub Frontend
    │
    └── Laravel API
            │
            ▼
        MySQL Database
```

Production deployment should include:

* HTTPS
* Secure environment configuration
* Production database credentials
* Nginx configuration
* PHP-FPM
* Application caching
* Database backups
* Log monitoring
* Restricted server access

---

# 🗺️ Future Development

Potential improvements for CL CarHub include:

* [ ] Customer-facing booking portal
* [ ] Online reservation requests
* [ ] Online payment integration
* [ ] Digital rental agreements
* [ ] Electronic signatures
* [ ] Automated email notifications
* [ ] SMS notifications
* [ ] Vehicle availability calendar
* [ ] Invoice generation
* [ ] Printable rental contracts
* [ ] Automated maintenance reminders
* [ ] Driver's license/document expiration reminders
* [ ] Advanced business reports
* [ ] Revenue analytics
* [ ] Fleet utilization analytics
* [ ] Audit logs
* [ ] Multi-branch support
* [ ] Mobile/PWA support

---

# 📌 Project Status

**🚧 In Development**

This project is actively being developed for **CL CarHub**. System functionality, workflows, database structures, and business rules may evolve as the operational requirements of the rental business are finalized.

---

# 🤝 Project Context

This is a **custom software project for CL CarHub**, not a generic or publicly hosted rental-management product.

The application's features and workflows are designed around the operational requirements of the CL CarHub business.

The project may contain business-specific information, configurations, workflows, and data structures that are intended exclusively for CL CarHub.

---

# 📄 License

This project is proprietary software developed specifically for **CL CarHub**.

The source code, system architecture, business logic, and related materials may not be copied, redistributed, modified, or commercially reused without appropriate authorization from the project owner and/or CL CarHub.

---

## 🚗 CL CarHub

**A dedicated digital platform for managing CL CarHub's rental operations.**

**Manage the fleet. Manage the rentals. Keep CL CarHub moving.**
