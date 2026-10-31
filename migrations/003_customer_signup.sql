-- Keep identity/profile creation atomic, including races with staff-created customers.
CREATE FUNCTION create_customer_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'CUSTOMER' THEN
    INSERT INTO customers(user_id,company,contact,email)
      VALUES(NEW.id,NEW.name,NEW.name,lower(trim(NEW.email)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_customer_profile AFTER INSERT ON "user"
  FOR EACH ROW EXECUTE FUNCTION create_customer_profile();
