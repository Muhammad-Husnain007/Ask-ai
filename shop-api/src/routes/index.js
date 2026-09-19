import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { cartRouter } from '../modules/cart/cart.routes.js';
import { categoryRouter } from '../modules/categories/category.routes.js';
import { checkoutRouter } from '../modules/checkout/checkout.routes.js';
import { orderRouter } from '../modules/orders/order.routes.js';
import { productRouter } from '../modules/products/product.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/orders', orderRouter);
