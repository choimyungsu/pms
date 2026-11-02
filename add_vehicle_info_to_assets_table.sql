ALTER TABLE tb_assets
ADD COLUMN is_vehicle BOOLEAN DEFAULT FALSE,
ADD COLUMN engine_oil_change_date DATE,
ADD COLUMN tire_replacement_date DATE;