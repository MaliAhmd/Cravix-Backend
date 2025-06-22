const express = require("express");
const sql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;

const app = express();
const upload = multer({ dest: "uploads/" });
const port = 5000;
app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const blacklistedTokens = new Set();

const pool = sql.createPool({
  host: "localhost",
  port: "3306",
  database: "cravix",
  user: "root",
  password: "",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const JWT_SECRET = "Cravix-madebykrypton";

pool.getConnection((err, connection) => {
  if (err) {
    console.log("SQL not connected", err);
  } else {
    console.log("SQL Connected successfully");
    connection.release();
  }
});

app.get("/adminlogin", (req, res) => {
  const query = "SELECT id, email, password FROM admin_login";
  pool.query(query, (err, result) => {
    if (err) {
      console.log("sql error", err);
      return res.status(500).json({ err: "Database error" });
    }
    res.json(result);
  });
});

app.post("/admin_login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const query = "SELECT * from admin_login WHERE email = ?";
    const values = [email, password];
    pool.query(query, values, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Login failed" });
      }

      if (result.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const admin = result[0];

      const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, {
        expiresIn: "1h",
      });

      console.log("Admin login Successfully");
      return res.status(200).json({
        message: "Admin Login",
        token: token,
        admin: {
          id: admin.id,
          email: admin.email,
        },
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "failed" });
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }
  
  // Check if token is blacklisted
  if (blacklistedTokens.has(token)) {
    return res.status(403).json({ error: "Forbidden - Token invalidated" });
  }
  
  jwt.verify(token, JWT_SECRET, (err, admin) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden - Invalid token" });
    }
    
    req.admin = admin;
    next();
  });
}

app.post("/admin-logout", authenticateToken, (req, res) => {
  const token = req.headers.authorization.split(" ")[1];
  blacklistedTokens.add(token);
  res.status(200).json({
    message: "Logout successful",
    logout: true,
  });
});

cloudinary.config({
  cloud_name: "dqlbidkyx",
  api_key: "977157985658271",
  api_secret: "g6tlACzfjxP1SUKvRuiA6d8bdgw",
});

app.post("/add_product", upload.single("p_image"), authenticateToken, async (req, res) => {
  let imgURL = null;
  const { p_name, p_price } = req.body;
  const p_image = req.file;

  if (!p_image || !p_name || !p_price) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    if (p_image) {
      const food_img = await cloudinary.uploader.upload(req.file.path, {
        folder: "FOOD",
      });
      imgURL = food_img.secure_url;
    }

    const query =
      "INSERT INTO add_product (p_image, p_name, p_price) VALUES (?,?,?)";
    const values = [imgURL, p_name, p_price];

    pool.query(query, values, (err, result) => {
      if (err) {
        console.error("Error to store in database", err);
        return res.status(500).json({ error: "Error to store" });
      } else {
        console.log("Successfully store in Database");
        return res
          .status(200)
          .json({ message: "Succesfully store in Database" });
      }
    });
  } catch (error) {
    console.error("Error uploading image to Cloudinary", error);
    res.status(500).json({ error: "Error uploading image" });
  }
});

app.get("/get_addProduct", authenticateToken ,(req, res) => {
  const query = "SELECT * from add_product";
  pool.query(query, (err, result) => {
    if (err) {
      console.log("Not Getting Data from Database");
      return res.status(500).json(message, "Not Getting Data from Database");
    }
    // console.log("Successfully Getting Data from Database");
    return res.status(200).json(result);
  });
});

app.get("/client_get_addProduct",(req, res) => {
  const query = "SELECT * from add_product";
  pool.query(query, (err, result) => {
    if (err) {
      console.log("Not Getting Data from Database");
      return res.status(500).json(message, "Not Getting Data from Database");
    }
    // console.log("Successfully Getting Data from Database");
    return res.status(200).json(result);
  });
});

app.put("/update_product/:id", upload.single("p_image"), authenticateToken,async (req, res) => {
  const p_id = req.params.id;
  const p_image = req.file;
  const { p_name, p_price } = req.body;

  // if (!p_image || !p_price || !p_name) {
  //   return res.status(400).json({ error: "Missing required fields" });
  // }

  try {
    const query = "SELECT * from add_product where id=?";
    pool.query(query, [p_id], async (err, result) => {
      if (err) {
        console.log("error fetching products", err);
        return res.status(500).json({ error: "Error Fetching Products" });
      }

      if (result.length === 0) {
        return res.status(404), json({ error: "No Product Found in Database" });
      }
      const existingImg = result[0];
      let imgURL = existingImg.p_image;

      if (p_image) {
        try {
          if (existingImg.p_image) {
            // console.log("image name", existingImg.p_image);
            const public_id = existingImg.p_image
              .split("/")
              .pop()
              .split(".")[0];
            await cloudinary.uploader.destroy(`FOOD/${public_id}`);
          }

          const food_img = await cloudinary.uploader.upload(p_image.path, {
            folder: "FOOD",
          });
          imgURL = food_img.secure_url;
        } catch (Cloudinary_error) {
          console.log("Error uploading image to cloudinary", Cloudinary_error);
          return res.status(500).json({ error: "Error updating image" });
        }
      }

      const update_query =
        "UPDATE add_product SET p_image = ?, p_name = ?, p_price = ? WHERE id= ?";
      const values = [imgURL, p_name, p_price, p_id];

      pool.query(update_query, values, (updateError, updateResult) => {
        if (updateError) {
          console.log("Error in storing data in database", updateError);
          return res
            .status(500)
            .json({ error: "Error in storing data in database" });
        }

        if (updateResult.affectedRows === 0) {
          return res.status(404).json({ error: "Product not found" });
        }

        console.log("Product updated successfully");
        return res
          .status(200)
          .json({ message: "Product updated successfully" });
      });
    });
  } catch (error) {
    console.error("Error in update process", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/delete_product/:id", authenticateToken,async (req, res) => {
  const p_id = req.params.id;

  try {
    const query = "SELECT * FROM add_product where id = ?";
    pool.query(query, [p_id], async (err, result) => {
      if (err) {
        console.log("Unable to delete the Product", err);
        return res
          .status(500)
          .json({ error: "Error occur in deleting the product" });
      }

      if (result === 0) {
        return res.status(404).json({ error: "Product not found" });
      }

      const product = result[0];
      // console.log("Hello",product);

      if (
        product &&
        product.p_image &&
        typeof product.p_image === "string" &&
        product.p_image.trim() !== ""
      ) {
        try {
          const urlParts = product.p_image.split("/");
          const publicIdWithExtension = urlParts[urlParts.length - 1];
          const public_id = publicIdWithExtension.split(".")[0];
          await cloudinary.uploader.destroy(`FOOD/${public_id}`);
          console.log("Image delete from cloudinary");
        } catch (cloudinary_error) {
          console.log("Not delete from cloudinary", cloudinary_error);
        }
      }
      const delete_query = "DELETE from add_product WHERE id=?";
      pool.query(delete_query, [p_id], (delete_err, delete_result) => {
        if (delete_err) {
          console.log("error in deleting product");
          return res.status(500).json({ error: "error in deleting product" });
        }

        if (delete_result.affectedRows === 0) {
          return res.status(404).json({ error: "No product found to delete" });
        }

        console.log("successfully deleted from database");
        return res
          .status(200)
          .json({ message: "successfully deleted from database" });
      });
    });
  } catch (error) {
    console.error("Error in delete process", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function generateOrderNumber() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${datePart}-${randomPart}`;
}

app.post("/process-transaction" ,async (req, res) => {
  const { items, subtotal, gst, total, amountPaid, balance } = req.body;

  // Validate required fields
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "No items in transaction" });
  }

  if (
    isNaN(subtotal) ||
    isNaN(gst) ||
    isNaN(total) ||
    isNaN(amountPaid) ||
    isNaN(balance)
  ) {
    return res
      .status(400)
      .json({ error: "Invalid numeric values in transaction" });
  }

  try {
    // Start a transaction
    const orderNumber = generateOrderNumber();
    const connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    try {
      // Insert the main transaction record
      const [transactionResult] = await connection.query(
        "INSERT INTO transactions (date, subtotal, gst, total, amount_paid, balance,  order_number) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [new Date(), subtotal, gst, total, amountPaid, balance, orderNumber]
      );

      const transactionId = transactionResult.insertId;

      // Insert all transaction items
      const itemPromises = items.map((item) => {
        return connection.query(
          "INSERT INTO transaction_items (transaction_id, name, price, quantity, updated_price) VALUES (?, ?, ?, ?, ?)",
          [
            transactionId,
            item.name,
            item.price,
            item.quantity,
            item.updatedPrice,
          ]
        );
      });

      await Promise.all(itemPromises);

      // Commit the transaction
      await connection.commit();
      connection.release();

      res.status(201).json({
        message: "Transaction processed successfully",
        transactionId: transactionId,
        orderNumber: orderNumber,
      });
    } catch (err) {
      // Rollback if any error occurs
      await connection.rollback();
      connection.release();
      console.error("Transaction processing error:", err);
      res.status(500).json({ error: "Failed to process transaction" });
    }
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({ error: "Database connection error" });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const [transactions] = await pool.promise().query(`
      SELECT t.id, t.order_number, t.date, t.total, 
        (SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) AS item_count
      FROM transactions t
      ORDER BY t.date DESC
    `);

    res.status(200).json(transactions);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.get("/transactions/:id",async (req, res) => {
  const transactionId = req.params.id;

  try {
    const [transaction] = await pool
      .promise()
      .query("SELECT * FROM transactions WHERE id = ?", [transactionId]);

    if (transaction.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const [items] = await pool
      .promise()
      .query("SELECT * FROM transaction_items WHERE transaction_id = ?", [
        transactionId,
      ]);

    res.status(200).json({
      ...transaction[0],
      items: items,
    });
  } catch (err) {
    console.error("Error fetching transaction:", err);
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

app.listen(port, () => {
  console.log(`Server run on ${port}`);
});
