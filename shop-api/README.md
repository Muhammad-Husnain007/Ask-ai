# shop-api

Express + MongoDB commerce backend.

## Modules

| Module | Prefix | Notes |
|---|---|---|
| Auth | `/api/v1/auth` | register, login, me, logout |
| Categories | `/api/v1/categories` | public list/get, admin create/patch/delete |
| Products | `/api/v1/products` | public list/get, admin create/patch/delete |
| Cart | `/api/v1/cart` | authenticated get/add/update/remove/clear |
| Checkout | `/api/v1/checkout` | create from cart, get, confirm payment |
| Orders | `/api/v1/orders` | list/get, admin status patch, cancel |

## Run

```bash
cd shop-api
copy .env.example .env
npm install
npm run seed
npm run dev
```

Needs MongoDB and Pulse running if you want error tracking.

- Health: http://127.0.0.1:4000/health
- Seed admin: `admin@shop.local` / `Admin123!`

Pulse (product): set `PULSE_DSN` in `.env`. The start script already preloads `@pulse/sdk/register`. No app-code changes.

## Auth header

```
Authorization: Bearer <token>
```

## Example flow

1. `POST /api/v1/auth/register`
2. `POST /api/v1/cart/items` `{ "productId", "quantity" }`
3. `POST /api/v1/checkout` with shipping address
4. `POST /api/v1/checkout/:id/confirm`
5. `GET /api/v1/orders`
