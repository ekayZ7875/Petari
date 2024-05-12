require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const app = express();
const mongoose = require("mongoose");
const authenticateToken = require("./middleware/auth.middleware.js");

const bcrypt = require("bcrypt");
const saltRounds = 10;

const nodemailer = require("nodemailer");
const moment = require("moment");
const hbs = require("nodemailer-express-handlebars");

const jwt = require("jsonwebtoken");
const flash = require("express-flash");

const Admin = require("./model/admin");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const NGO = require("./model/ngo");
const isAdmin = require("./middleware/isAdmin");
// const  User=require("./model/user")
const Query = require("./model/query"); // Adjust the path based on your project structure

// app.use(flash());

app.set("view engine", "ejs");

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.mail_id,
    pass: process.env.pass_id,
  },
});

const handlebarOptions = {
  viewEngine: {
    extName: ".handlebars",
    partialsDir: path.resolve("./views"),
    defaultLayout: false,
  },
  viewPath: path.resolve("./views"),
  extName: ".handlebars",
};

transporter.use("compile", hbs(handlebarOptions));

transporter.verify().then(console.log).catch(console.error);

app.locals.moment = moment;

mongoose
  .connect("mongodb://127.0.0.1:27017/PetariDB")
  .then(() => {
    console.log("Database Connected");
  })
  .catch((err) => {
    console.log(err.message);
  });

app.get("/", function (req, res) {
  res.render("index");
});

app.get("/user_login", function (req, res) {
  res.render("user_login");
});

app.get("/Ngo_login", function (req, res) {
  res.render("NGO_login");
});

app.get("/admin_login", function (req, res) {
  res.render("admin_login");
});

app.get("/User_singUp", function (req, res) {
  res.render("User_singUp");
});

app.get("/success", function (req, res) {
  res.render("success");
});

app.post("/", async function (req, res) {
  try {
    const newQuery = new Query({
      name: req.body.Fname,
      email: req.body.Email,
      subject: req.body.sub,
      message: req.body.sms,
    });

    await newQuery.save();

    res.status(200).send("Successfully Received Message... Thank You!");
    console.log(newQuery);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

const userSchema = new mongoose.Schema({
  // username: {
  //     type: String,
  //     unique: true,
  //     required: true,
  // },
  email: String,
  password: String,
  fullName: String,
  address: String,
  Mobile: Number,
  dob: String,
  gender: {
    type: String,
    enum: ["male", "female", "other"],
  },
  flatNo: { type: String },
  addressLine1: { type: String },
  addressLine2: { type: String },
  city: { type: String },
  state: { type: String },
  zip: { type: String },
  foodInventory: [
    {
      foodItem: { type: String },
      quantity: { type: Number },
    },
  ],
  // googleId: String,
  // profile: String,
});

const User = new mongoose.model("User", userSchema);

// user Registration
app.post("/User_singUp", async function (req, res) {
  const { username } = req.body;

  try {
    // Check if the email already exists
    const existingUser = await User.findOne({ email: username }).exec();

    if (existingUser) {
      // Email already exists, handle accordingly (e.g., show an error message)
      return res.render("registrationError", {
        message: "Email is already registered",
      });
    }

    // Email does not exist, proceed with user registration
    const hash = await bcrypt.hash(req.body.password, saltRounds);

    const newUser = new User({
      username: username,
      fullName: req.body.fname,
      Mobile: req.body.phn,
      address: req.body.address,
      dob: req.body.dob,
      gender: req.body.gender,
      email: username,
      password: hash,
    });

    await newUser.save().then((user) => {
      let mailOptions = {
        to: user.email,
        subject: "Welcome To Petari",
        template: "Email.template",
        context: {
          user: {
            fname: user.fullName,
            _id: user._id,
            username: user.fullName,
            email: user.email,
          },
          year: new Date().getFullYear(),
        },
        attachments: [
          {
            filename: "logo.png",
            path: path.join(__dirname, "public", "img", "logo.png"),
            cid: "logo",
          },
        ],
      };
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
        } else {
          console.log("Email sent: " + info.response);
        }
      });
    });

    return res.render("UserDashBoard", {
      fullName: req.body.fname,
      email: username,
      phoneNo: req.body.phn,
      address: req.body.address,
      // Do not include 'profile' here unless it's relevant to registration
    });
  } catch (error) {
    console.error("Error during user registration:", error);
    return res.status(500).send("Internal Server Error");
  }
});

// user login
app.post("/login", async function (req, res) {
  const { username, password } = req.body;

  try {
    const foundUser = await User.findOne({ email: username });

    if (!foundUser) {
      return res.render("loginError", { message: "User not found" });
    }

    const result = await bcrypt.compare(password, foundUser.password);

    if (result && foundUser) {
      const token = jwt.sign({ userId: foundUser.id }, "secret_key", {
        expiresIn: "365d",
      });

      res.json({ message: "Login In succesfully", token });
      return res.render("UserDashBoard", {
        fullName: foundUser.fullName,
        email: foundUser.email,
        phoneNo: foundUser.Mobile,
        address: foundUser.address,
      });
    } else {
      return res.render("loginError", { message: "Incorrect password" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).send("Internal Server Error");
  }
});

app
  .route("/forgot-password")
  .get(async (req, res) => {
    res.render("forget-password");
  })
  .post(async (req, res) => {
    const { email } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.send("User Not Exist");
      }

      // Generate a reset token and save it to the user
      const resetToken = jwt.sign(
        { email: user.email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );

      user.resetTokenExpiration = Date.now() + 300000; // 5 minutes
      await user.save();

      // Send the reset link to the user via email
      const resetLink = `http://localhost:3000/reset-password?email=${encodeURIComponent(
        user.email
      )}&token=${encodeURIComponent(resetToken)}`; // Replace with the actual path to your logo
      console.log(resetLink);
      const mailOptions = {
        to: user.email,
        subject: "Password Reset",
        template: "reset-password", // Use the Handlebars template
        context: {
          user: {
            fname: user.fullName,
            _id: user._id,
            username: user.username,
            email: user.email,
          },
          resetLink,
        },
        attachments: [
          {
            filename: "logo.png",
            path: path.join(__dirname, "public", "img", "logo.png"),
            cid: "logo",
          },
        ],
      };
      console.log("User email:", user.email);

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error(error);
          return res.status(500).send("Error sending reset email");
        }
        console.log(`Reset email sent: ${info.response}`);
        res.send("Password reset link sent successfully");
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  });

app
  .route("/reset-password")
  .get(async (req, res) => {
    const { email, token } = req.query;

    try {
      const user = await User.findOne({
        email,
        resetToken: token,
        resetTokenExpiration: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).send("Invalid or expired reset token");
      }

      // Verify the token
      try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        // Process the decoded token (e.g., extract information from it)
        console.log(decodedToken);
        // Continue with the reset-password logic
        res.render("reset-password", { email, token });
      } catch (error) {
        // Handle JWT verification errors
        console.error("JWT verification error:", error.message);
        // You might want to send an error response or redirect the user
        res.status(401).send("Unauthorized");
      }
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  })
  .post(async (req, res) => {
    const { email, token, newPassword } = req.body;

    try {
      // Verify the token again
      const user = await User.findOne({
        email,
        resetToken: token,
        resetTokenExpiration: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).send("Invalid or expired reset token");
      }

      try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        // Process the decoded token (e.g., extract information from it)
        console.log(decodedToken);

        // Update the user's password and reset the resetToken fields
        const hash = await bcrypt.hash(newPassword, saltRounds);
        user.password = hash;
        user.resetToken = null;
        user.resetTokenExpiration = null;
        await user.save();

        res.redirect("/login"); // Redirect to login page or any other desired page
      } catch (error) {
        // Handle JWT verification errors
        console.error("JWT verification error:", error.message);
        // You might want to send an error response or redirect the user
        res.status(401).send("Unauthorized");
      }
    } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
    }
  });

// extra details added for the user
app.post("/add-details", authenticateToken, async (req, res) => {
  try {
    // Find the user by their email
    let user = await User.findOne({ email: req.body.email });

    // If the user exists, update their details
    if (user) {
      // Update the user's details
      user.flatNo = req.body.flatNo;
      user.addressLine1 = req.body.addressLine1;
      user.addressLine2 = req.body.addressLine2;
      user.city = req.body.city;
      user.state = req.body.state;
      user.zip = req.body.zip;
      user.foodInventory.push({
        foodItem: req.body.foodItem,
        quantity: req.body.quantity,
      });

      // Save the updated user document
      await user.save();
      res.status(200).json({ message: "Details added successfully" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Error adding details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const problem = require("./model/query");

const ad = Admin({
  username: "sahilkaitha@gmail.com",
  password: "123",
  fullName: "Sahil Hossain",
  Mobile: "9635955320",
});
ad.save();

// admin code
app.post("/approve-ngo/:id", authenticateToken, async (req, res) => {
  const ngoId = req.params.id;

  try {
    const ngo = await NGO.findById(ngoId);
    if (!ngo) {
      return res.status(404).json({ error: "NGO not found" });
    }

    // Update the NGO's approval status

    ngo.approved = true;
    await ngo.save();

    // Send an email to the NGO with the approved details
    let mailOptions = {
      to: ngo.username,
      subject: "NGO Registration Approved",
      text: "Your NGO registration has been approved. You can now login to your account.",
      // Include any necessary information in the email body
    };
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });

    res.status(200).json({ message: "NGO approved successfully" });
  } catch (error) {
    console.error("Error approving NGO:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/admin-login", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  const admin = await Admin.findOne({ username: username, password: password });

  try {
    const dooner = await User.find(); // Assuming User is your Mongoose model for users
    const ngo = await NGO.find();

    const query1 = await problem.find();
    res.render("Admin_Dashboard", {
      name: admin.fullName,
      email: admin.fullName,
      mobile: admin.Mobile,
      username: admin.username,
      id: admin._id,
      NGOname: ngo,
      Donername: dooner,
      UserName: "sahil114",
      complain: query1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("An internal server error occurred.");
  }
});

app.get("/admin-logout", function (req, res) {
  return res.redirect("/");
});

app.get("/Ngo-Registration", authenticateToken, async (req, res) => {
  res.render("NGO-Registration");
});

app.post("/NGO-Registarion", authenticateToken, async (req, res) => {
  // Check if the NGO already exists
  const existingNGO = await NGO.findOne({ username: req.body.username });
  if (existingNGO) {
    return res.status(400).json({ error: "NGO already exists" });
  }

  // Create a new NGO registration
  const newNGO = new NGO({
    username: req.body.username,
    password: req.body.password,
    NGOName: req.body.NGOName,
    Mobile: req.body.Mobile,
    NgoID: req.body.NgoID,
    NgoLocation: req.body.NgoLocation,
    approved: false,
  });

  // Save the new NGO to the database

  try {
    // Save the new NGO to the database
    await newNGO.save();

    // Send an email to the admin for approval
    let mailOptions = {
      to: newNGO.username, // Admin's email address
      subject: "New NGO Registration",
      text: "A new NGO registration is pending approval. Login to the admin panel to review and approve.",
      // Include any necessary information in the email body
    };
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });

    console.log("NGO registration request sent for approval");
    res
      .status(200)
      .json({ message: "NGO registration request sent for approval" });
  } catch (err) {
    console.error("Error creating NGO:", err);
    res.status(500).json({ error: "Internal server error" });
  }
  // try {
  //     await newNGO.save();

  //     let mailOptions = {
  //         to: newNGO.username,
  //         subject: 'Welcome To Petari',
  //         template: 'Email.template',
  //         context: {
  //             ngo: {
  //                 ngoName: newNGO.name,
  //                 _id: newNGO._id,
  //                 username: newNGO.password,
  //             },
  //             year: new Date().getFullYear()
  //         },
  //         attachments: [{
  //             filename: 'logo.png',
  //             path: path.join(__dirname, 'public', 'img', 'logo.png'),
  //             cid: 'logo'
  //         }]
  //     };

  //     transporter.sendMail(mailOptions, function(error, info){
  //         if (error) {
  //             console.log(error);
  //         } else {
  //             console.log('Email sent: ' + info.response);
  //         }
  //     });

  //     console.log('NGO registered successfully');
  //     res.status(200).json({ message: 'NGO registration received. It will be reviewed by the admin.' });
  // } catch (err) {
  //     console.error('Error creating NGO:', err);
  //     res.status(500).json({ error: 'Internal server error' });
  // }
  // newNGO.save()
  // .then((ngo) => {
  //     let mailOptions = {
  //         to: ngo.username,
  //         subject: 'Welcome To Petari',
  //         template: 'Email.template',
  //         context: {
  //             ngo: {
  //                 ngoName: ngo.name,
  //                 _id: ngo._id,
  //                 username: ngo.password,

  //             },

  //             year: new Date().getFullYear()
  //         },
  //         attachments: [{
  //             filename: 'logo.png',
  //             path: path.join(__dirname, 'public', 'img', 'logo.png'),
  //             cid: 'logo'
  //         }]
  //     };
  //     transporter.sendMail(mailOptions, function(error, info){
  //         if (error) {
  //             console.log(error);
  //         } else {
  //             console.log('Email sent: ' + info.response);
  //         }
  //     });

  //     console.log('NGO registered successfully');
  //     res.status(200).json({ message: 'NGO registered successfully' });

  // })
  // .catch((err) => {
  //     console.error('Error creating NGO:', err);
  //     res.status(500).json({ error: 'Internal server error' });
  // });
});

// Assume you have a route for rendering the admin dashboard
// Assuming `pendingNGOs` is an array of pending NGOs
app.get("/admin-dashboard", authenticateToken, async function (req, res) {
  try {
    const pendingNGOs = await NGO.find({ status: "pending" });
    res.render("admin_dashboard", { pendingNGOs });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

const Ngo = require("./model/ngo");
const { authenticateToken } = require("./middleware/auth.middleware");
app.post("/Ngo-login", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const ngo = await Ngo.findOne({ username: username, password: password });
  try {
    const dooner = await User.find(); // Assuming User is your Mongoose model for users

    res.render("NGO-Dashboard", {
      fullName: ngo.NGOName,
      email: ngo.username,
      id: ngo.NgoID,
      phoneNo: ngo.Mobile,
      address: ngo.NgoLocation,
      Donation: dooner,
      Pickup: dooner,
      complain: "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("An internal server error occurred.");
  }
});

// user delete from the databse

app.post("/delete-details", async (req, res) => {
  try {
    // Find the user by their email
    let user = await User.findOne({ email: req.body.email });

    // If the user exists, delete their details
    if (user) {
      // Update the user's details
      user.flatNo = "";
      user.addressLine1 = "";
      user.addressLine2 = "";
      user.city = "";
      user.state = "";
      user.zip = "";
      user.foodInventory = [];

      // Save the updated user document
      await user.save();
      res.status(200).json({ message: "Details deleted successfully" });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Error deleting details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/logout", function (req, res) {
  return res.redirect("/");
});

// server rendering

//    server rendiring

app.listen(process.env.port || 3000, function () {
  console.log("server is running on port 3000 ");
});
