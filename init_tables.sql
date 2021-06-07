  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT,
    password TEXT
  );

  CREATE TABLE habits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    habit TEXT,
    avatar INTEGER,
    action TEXT,
    frequency INTEGER,
    reminder_time TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status BOOLEAN,
    end_date TEXT,
    formation_days INTEGER,
    completed_days INTEGER,
    last_check_in TEXT
  );

  CREATE TABLE updates(
    id SERIAL PRIMARY KEY,
    habit_id INTEGER,
    update TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

