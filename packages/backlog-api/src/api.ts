import Koa from "koa";
import Router from "koa-router";

const app = new Koa();
const router = new Router();

// Define a simple GET route
router.get("/", (ctx) => {
  ctx.body = {
    message: 'Hello, World!',
  };
});

// Use the router middleware
app.use(router.routes()).use(router.allowedMethods());

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
