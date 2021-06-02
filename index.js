import express from "express";
import pg from "pg";
import jsSHA from "jssha";
import cookieParser from "cookie-parser";
import axios from "axios";

// Initialise the DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: "yiqing",
  host: "localhost",
  database: "project2",
  port: 5432,
};
const pool = new Pool(pgConnectionConfigs);
const app = express();
// app.use((request, response, next) => {
//   // set the default value
//   request.isUserLoggedIn = false;

//   // check to see if the cookies you need exists
//   if (request.cookies.loggedIn && request.cookie.userId) {
//     // get the hased value that should be inside the cookie
//     const hash = getHash(request.cookies.userId);

//     // test the value of the cookie
//     if (request.cookies.loggedIn === hash) {
//       request.isUserLoggedIn = true;

//       // look for this user in the database
//       const values = [request.cookies.userId];

//       // try to get the user
//       pool.query('SELECT * FROM users WHERE id=$1', values, (error, result) => {
//         if (error || result.rows.length < 1) {
//           response.render('login',{});
//           return;
//         }

//         // set the user as a key in the request object so that it's accessible in the route
//         request.user = result.rows[0];

//         next();
//       });

//       // make sure we don't get down to the next() below
//       return;
//     }
//   }

//   next();
// });
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
//authentication
const getHash = (input) => {
  // create new SHA object
  const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });

  // create an unhashed cookie string based on user ID and salt
  const unhashedString = `${input}`;

  // generate a hashed cookie string using SHA object
  shaObj.update(unhashedString);

  return shaObj.getHash("HEX");
};
const checkAuth = (request, response, next) => {
  // set the default value
  request.isUserLoggedIn = false;

  // check to see if the cookies you need exists
  if (request.cookies.loggedIn && request.cookies.userId) {
    // get the hased value that should be inside the cookie
    const hash = getHash(request.cookies.userId);

    // test the value of the cookie
    if (request.cookies.loggedIn === hash) {
      request.isUserLoggedIn = true;
    }
  }
  request.isUserLoggedIn ? next() : response.redirect("/login");
};
//main home page
app.get("/", checkAuth, (req, res) => {
  //render home page of user, will require the following data - username, user habits
  pool.query(
    `SELECT id,name FROM users WHERE email='${getHash(req.cookies.userId)}'`,
    (err, results) => {
      if (err) {
        return console.log("error", err);
      }
      console.log(results.rows);
      const user_id = results.rows[0].id;
      const username = results.rows[0].name;
      pool.query(
        `SELECT * FROM habits WHERE user_id=${user_id}`,
        (error, result) => {
          if (error) {
            console.error("error", error);
            return;
          }
          const data = { user: { name: username }, habits: result.rows };
          res.render("homepage", data);
        }
      );
    }
  );
});

//update habit
app.get("/update/:habit_id", checkAuth, (req, res) => {
  console.log(req.params.habit_id);
  pool.query(
    `SELECT * FROM habits WHERE id=${req.params.habit_id}`,
    (error, result) => {
      if (error) {
        console.error("error", error);
      }
      const habitDetails = result.rows[0];
      res.render("updateForm", { habit: habitDetails });
    }
  );
});

//create habit pages
app.get("/create/:user_id", checkAuth, (req, res) => {
  res.render("newHabit", { user_id: req.params.user_id });
});
app.post("/create/:user_id", checkAuth, (req, res) => {
  console.log(req.body);
  pool.query(
    "INSERT INTO habits (user_id,habit,description,avatar,status,reminder_time,action,formation_days,end_date,completed_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [
      req.params.user_id,
      req.body.habit,
      req.body.description,
      req.body.avatar,
      true,
      req.body.reminder,
      req.body.action,
      req.body.formationDays,
      req.body.endDate,
      0,
    ],
    (error, result) => {
      if (error) {
        return console.error("error", error);
      }
      const habit_id = result.rows[0].id;
      [...req.body.frequency].forEach((frequency) => {
        pool.query(
          "INSERT INTO habit_action (habit_id,frequency) VALUES ($1,$2)",
          [habit_id, frequency],
          (err, results) => {
            if (err) {
              return console.error("err", err);
            }
            console.log("successfully added");
          }
        );
      })(res.redirect("/"));
    }
  );
});

//user login page
app.get("/signup", (req, res) => {
  res.render("signUpForm", {});
});

app.post("/signup", (req, res) => {
  const email = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
  email.update(req.body.email);
  const hashedEmail = email.getHash("HEX");
  const password = new jsSHA("SHA-512", "TEXT", {
    encoding: "UTF8",
  });
  password.update(req.body.password);
  const hashedPassword = password.getHash("HEX");

  pool.query(
    "INSERT INTO users (name,email,password) VALUES ($1,$2,$3)",
    [req.body.name, hashedEmail, hashedPassword],
    (err, result) => {
      if (err) {
        console.log("error", err);
      }
      res.cookie("userId", req.body.email);
      res.cookie("loggedIn", hashedEmail);
      res.redirect("/");
    }
  );
});
app.get("/login", (req, res) => {
  res.render("loginForm", {});
});
app.post("/login", (req, res) => {
  pool.query(
    `SELECT * FROM users WHERE email='${getHash(
      req.body.email
    )}' AND password='${getHash(req.body.password)}'`,
    (err, result) => {
      if (err) {
        console.log("error", err);
      } else {
        console.log(getHash(req.body.email), getHash(req.body.password));
        if (result.rows[0]) {
          res.cookie("userId", req.body.email);
          res.cookie("loggedIn", getHash(req.body.email));
          res.redirect("/");
        } else {
          res.redirect("/");
        }
      }
    }
  );
});
app.get("/logout", (req, res) => {
  res.clearCookie("userId");
  res.clearCookie("loggedIn");
  res.redirect("/");
});
//user sign up page
app.listen(3004);
