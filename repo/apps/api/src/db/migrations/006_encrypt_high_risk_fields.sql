DROP FUNCTION IF EXISTS omnistock_try_decrypt_bytea(BYTEA, TEXT);
CREATE OR REPLACE FUNCTION omnistock_try_decrypt_bytea(input BYTEA, encryption_key TEXT)
RETURNS BYTEA AS $$
BEGIN
  BEGIN
    RETURN pgp_sym_decrypt_bytea(input, encryption_key);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN input;
  END;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS omnistock_try_decrypt_text(BYTEA, TEXT);
CREATE OR REPLACE FUNCTION omnistock_try_decrypt_text(input BYTEA, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  BEGIN
    RETURN pgp_sym_decrypt(input, encryption_key);
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN
        RETURN convert_from(input, 'UTF8');
      EXCEPTION
        WHEN OTHERS THEN
          RETURN NULL;
      END;
  END;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  encryption_key TEXT := current_setting('app.encryption_key', true);
BEGIN
  IF encryption_key IS NULL OR btrim(encryption_key) = '' THEN
    RAISE EXCEPTION 'app.encryption_key must be set before running encryption migration';
  END IF;

  UPDATE integration_clients
  SET hmac_secret = pgp_sym_encrypt_bytea(
    omnistock_try_decrypt_bytea(hmac_secret, encryption_key),
    encryption_key,
    'cipher-algo=aes256,compress-algo=0'
  )
  WHERE hmac_secret IS NOT NULL;

  UPDATE users
  SET phone_number = pgp_sym_encrypt(
    omnistock_try_decrypt_text(phone_number, encryption_key),
    encryption_key,
    'cipher-algo=aes256,compress-algo=0'
  )
  WHERE phone_number IS NOT NULL;

  UPDATE users
  SET personal_email = pgp_sym_encrypt(
    omnistock_try_decrypt_text(personal_email, encryption_key),
    encryption_key,
    'cipher-algo=aes256,compress-algo=0'
  )
  WHERE personal_email IS NOT NULL;
END $$;
