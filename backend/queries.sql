CREATE DATABASE ride_sharing;
USE ride_sharing;

CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    refresh_token VARCHAR(512) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_phone UNIQUE (phone)
) ENGINE = InnoDB;


-- 2. TRIPS
CREATE TABLE trips (
    id BIGINT UNSIGNED AUTO_INCREMENT,
    publisher_id BIGINT UNSIGNED NOT NULL,
    ride_type ENUM('self_driven', 'cab_share') NOT NULL,
    source VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    departure_time DATETIME NOT NULL,
    total_seats TINYINT UNSIGNED NOT NULL,
    available_seats TINYINT UNSIGNED NOT NULL,
    estimated_total_cost DECIMAL(10,2),
    cost_per_person DECIMAL(10,2),
    notes VARCHAR(1000),
    status ENUM(
        'open',
        'full',
        'in_progress',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'open',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_trips PRIMARY KEY (id),

    CONSTRAINT fk_trips_publisher
        FOREIGN KEY (publisher_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_trips_seats
        CHECK (
            total_seats > 0
            AND available_seats <= total_seats
        ),

    CONSTRAINT chk_trips_total_cost
        CHECK (
            estimated_total_cost IS NULL
            OR estimated_total_cost >= 0
        ),

    CONSTRAINT chk_trips_person_cost
        CHECK (
            cost_per_person IS NULL
            OR cost_per_person >= 0
        ),

    INDEX idx_trips_route_time (
        source,
        destination,
        departure_time
    ),

    INDEX idx_trips_publisher (publisher_id),
    INDEX idx_trips_status_time (status, departure_time)
) ENGINE = InnoDB;


-- 3. TRIP BOOKINGS / JOIN REQUESTS
CREATE TABLE trip_bookings (
    id BIGINT UNSIGNED AUTO_INCREMENT,
    trip_id BIGINT UNSIGNED NOT NULL,
    passenger_id BIGINT UNSIGNED NOT NULL,
    seats_requested TINYINT UNSIGNED NOT NULL DEFAULT 1,

    status ENUM(
        'pending',
        'approved',
        'rejected',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',

    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,

    CONSTRAINT pk_trip_bookings PRIMARY KEY (id),

    CONSTRAINT fk_bookings_trip
        FOREIGN KEY (trip_id)
        REFERENCES trips(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_bookings_passenger
        FOREIGN KEY (passenger_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT uq_booking_trip_passenger
        UNIQUE (trip_id, passenger_id),

    CONSTRAINT chk_booking_seats
        CHECK (seats_requested > 0),

    INDEX idx_bookings_passenger_status (
        passenger_id,
        status
    ),

    INDEX idx_bookings_trip_status (
        trip_id,
        status
    )
) ENGINE = InnoDB;

