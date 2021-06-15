import express from "express";
import pg from "pg";
import jsSHA from "jssha";
import cookieParser from "cookie-parser";
import cron from "node-cron";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialise the DB connection
const { Pool } = pg;
let pgConnectionConfigs;
if (process.env.DATABASE_URL) {
  // pg will take in the entire value and use it to connect
  pgConnectionConfigs = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  };
} else {
  pgConnectionConfigs = {
    user: "yiqing",
    host: "localhost",
    database: "project2",
    port: 5432,
  };
}
const pool = new Pool(pgConnectionConfigs);
const app = express();

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
// function to get difference in days between day provided in parameter and the current day
const getNumberOfDays = (end) => {
  const date1 = new Date();
  const date2 = new Date(end);

  // One day in milliseconds
  const oneDay = 1000 * 60 * 60 * 24;

  // Calculating the time difference between two dates
  const diffInTime = date2.getTime() - date1.getTime();

  // Calculating the no. of days between two dates
  const diffInDays = Math.round(diffInTime / oneDay);

  return diffInDays;
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
      //get all habits tied to the user that are active
      pool.query(
        `SELECT * FROM habits WHERE user_id=${user_id}  AND status=true`,
        (error, result) => {
          if (error) {
            console.error("error", error);
            return;
          }
          const activeHabits = [];
          //get array of habits that are ongoing
          result.rows.forEach((habit) => {
            if (
              getNumberOfDays(habit.end_date) >= 0 &&
              getNumberOfDays(habit.last_check_in) >= -habit.frequency
            ) {
              activeHabits.push(habit);
              console.log(
                "habit id",
                habit.id,
                "cond1",
                getNumberOfDays(habit.end_date),
                "cond2",
                getNumberOfDays(habit.last_check_in)
              );
            }
            console.log("99", habit.id, getNumberOfDays(habit.last_check_in));
          });
          //update any habits that has passed the dued check in date as missed habits
          result.rows.forEach((habit) => {
            if (
              getNumberOfDays(habit.end_date) < 0 ||
              getNumberOfDays(habit.last_check_in) < -habit.frequency
            ) {
              pool.query(
                `UPDATE habits SET status=false WHERE id=${habit.id}`,
                (err, result) => {
                  if (err) {
                    return console.log("error", err);
                  }
                }
              );
            }
          });
          const avatarState = [];
          activeHabits.forEach((habit) => {
            const fractionOfTimeLapse = Math.abs(
              getNumberOfDays(habit.last_check_in) / habit.frequency
            );
            console.log(
              "wat",
              getNumberOfDays(habit.last_check_in),
              fractionOfTimeLapse
            );
            if (fractionOfTimeLapse > 0.5) {
              avatarState.push("angry");
            } else if (fractionOfTimeLapse > 0.05) {
              avatarState.push("neutral");
            } else {
              avatarState.push("happy");
            }
          });
          const data = {
            user: { name: username },
            habits: activeHabits,
            avatarState: avatarState,
            user_id: user_id,
          };
          res.render("homepage", data);
        }
      );
    }
  );
});
//social feature to view other users' active habits
app.get("/social/:user_id", (req, res) => {
  pool.query(
    "SELECT users.name,habits.habit,habits.avatar,habits.action FROM users INNER JOIN habits ON habits.user_id=users.id WHERE habits.status=true ORDER BY habits.created_at",
    (err, result) => {
      if (err) {
        return console.error("error", err);
      }
      res.render("social", {
        user_id: req.params.user_id,
        habits: result.rows,
      });
    }
  );
});
// to view all missed habits (habits that were created but not completed)
app.get("/missed/:user_id", (req, res) => {
  pool.query(
    `SELECT * FROM habits WHERE user_id=${req.params.user_id}  AND status=false`,
    (err, result) => {
      if (err) {
        return console.error("error", err);
      }
      res.render("missedHabits", {
        user_id: req.params.user_id,
        habits: result.rows,
      });
    }
  );
});
//update habit by clicking on 'feed me' button for avatar
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

app.post("/update/:habit_id", checkAuth, (req, res) => {
  const currentDate = new Date();
  const checkInDate = `${currentDate.getFullYear()}-0${
    currentDate.getMonth() + 1
  }-0${currentDate.getDate()}`;
  console.log(checkInDate, req.params.habit_id, getNumberOfDays(checkInDate));
  pool.query(
    `UPDATE habits SET last_check_in = '${checkInDate}' WHERE id =${req.params.habit_id}`,
    (err, result) => {
      if (err) {
        return console.err("error", err);
      }
      res.redirect("/");
    }
  );
  pool.query(
    "INSERT INTO updates (habit_id,update) VALUES ($1,$2)",
    [req.params.habit_id, req.body.update],
    (err, result) => {
      if (err) {
        return console.log("error", err);
      }
    }
  );
});

//create habit
app.get("/create/:user_id", checkAuth, (req, res) => {
  res.render("newHabit", { user_id: req.params.user_id });
});

app.post("/create/:user_id", checkAuth, (req, res) => {
  console.log(typeof req.body.frequency);
  const formationDays = getNumberOfDays(req.body.endDate);
  const dateRightNow = new Date();
  const currentDate = `${dateRightNow.getFullYear()}-${
    dateRightNow.getMonth() + 1
  }-${dateRightNow.getDate()}`;
  console.log(req.body.frequency);
  pool.query(
    "INSERT INTO habits (user_id,habit,avatar,action,frequency,reminder_time,status,end_date,formation_days,completed_days,last_check_in) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
    [
      req.params.user_id,
      req.body.habit,
      req.body.avatar,
      req.body.action,
      req.body.frequency,
      req.body.reminder,
      true,
      req.body.endDate,
      formationDays,
      0,
      currentDate,
    ],
    (error, result) => {
      if (error) {
        return console.error("error", error);
      }
      res.redirect("/");
    }
  );
  const reminderHour = Number(req.body.reminder.split(":")[0]);
  const reminderMinute = Number(req.body.reminder.split(":")[1]);
  //determination if first reminder should be sent the day the habit was set
  const hasReminderTimePassed =
    reminderHour === dateRightNow.getHours()
      ? reminderMinute >= dateRightNow.getMinutes()
      : reminderHour > dateRightNow.getHours();
  console.log(reminderHour, reminderMinute);
  //cron job that is set to start upon habit creation
  const job = cron.schedule(
    `${reminderMinute} */${req.body.frequency * 24} * * *`,
    function () {
      console.log("send mail");
      //calculation of time to schedule the mail on
      const emailDateRightNow = new Date();
      let secondsAdded;
      if (hasReminderTimePassed) {
        secondsAdded =
          (24 - emailDateRightNow.getHours() - 1 + reminderHour) * 60 * 60 +
          (60 - emailDateRightNow.getMinutes() + reminderMinute) * 60;
      } else {
        secondsAdded =
          (reminderHour - emailDateRightNow.getHours()) * 60 * 60 +
          (reminderMinute - emailDateRightNow.getMinutes()) * 60;
      }
      let emailSentAt = +emailDateRightNow.getTime() + secondsAdded;
      emailSentAt = Math.floor(emailSentAt / 10000) * 10;

      console.log(emailSentAt);
      console.log(reminderHour - emailDateRightNow.getHours() - 1);
      console.log(reminderMinute - emailDateRightNow.getMinutes());
      console.log(secondsAdded);
      const msg = {
        to: "yiqingzh58@gmail.com", // Change to your recipient
        from: "habitreminder17@gmail.com", // Change to your verified sender
        subject: "Habit Reminder",
        text: "Your avatar is hungry :( Login to habit to check in on your progress to feed your avatar!",
        html: "<strong>Your avatar is hungry :( Login to habit to check in on your progress to feed your avatar!</strong>",
        send_at: emailSentAt,
      };
      sgMail
        .send(msg)
        .then((response) => {
          console.log(response[0].statusCode);
          console.log(response[0].headers);
        })
        .catch((error) => {
          console.error(error);
        });
    },
    null,
    true,
    "Asia/Singapore"
  );
});
//user sign up page
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
//user login page
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
//user logout page
app.get("/logout", (req, res) => {
  res.clearCookie("userId");
  res.clearCookie("loggedIn");
  res.redirect("/");
});

const PORT = process.env.PORT || 3004;

app.listen(PORT);
