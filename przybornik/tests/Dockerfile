# Obraz do testów i podglądu lokalnego: PHP z Imagick (HEIC, PDF przez Ghostscript) i ZIP.
ARG PHP=8.4
FROM php:${PHP}-cli
RUN apt-get update \
 && apt-get install -y --no-install-recommends libmagickwand-dev ghostscript libzip-dev libheif-dev \
 && printf "\n" | pecl install imagick \
 && docker-php-ext-enable imagick \
 && docker-php-ext-install zip \
 && rm -rf /var/lib/apt/lists/* /tmp/pear
