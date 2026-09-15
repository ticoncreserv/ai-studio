FROM php:8.5-fpm

ARG FREETDS_VERSION=1.4.23

RUN apt-get update && apt-get install -y --no-install-recommends \
    caddy \
    git \
    unzip \
    libpng-dev \
    libzip-dev \
    libxml2-dev \
    libldap2-dev \
    libonig-dev \
    libicu-dev \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    unixodbc \
    unixodbc-dev \
    gnupg \
    curl \
    ca-certificates \
    autoconf \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://www.freetds.org/files/stable/freetds-${FREETDS_VERSION}.tar.gz" -o /tmp/freetds.tar.gz \
    && tar -xzf /tmp/freetds.tar.gz -C /tmp \
    && cd /tmp/freetds-${FREETDS_VERSION} \
    && ./configure --prefix=/usr/local --with-tdsver=auto --enable-msdblib \
    && make -j"$(nproc)" && make install \
    && rm -rf /tmp/freetds*

RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
      pdo_mysql gd zip bcmath intl ldap ftp exif sockets pcntl opcache \
      mysqli \
    && docker-php-ext-configure pdo_dblib --with-pdo-dblib=/usr/local \
    && docker-php-ext-install pdo_dblib \
    && docker-php-ext-configure pdo_odbc --with-pdo-odbc=unixODBC,/usr \
    && docker-php-ext-install pdo_odbc

COPY infra/php-fpm.conf /usr/local/etc/php-fpm.d/zz-atelier.conf
COPY infra/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY infra/freetds.conf /usr/local/etc/freetds.conf
COPY infra/Caddyfile /etc/caddy/Caddyfile

RUN php -m | grep -qi pdo_sqlsrv && echo "pdo_sqlsrv must not be installed" && exit 1 || true
RUN php -m | grep -Eiq '(^| )redis( |$)' && echo "ext-redis must not be installed" && exit 1 || true

WORKDIR /var/www/html
EXPOSE 80
CMD ["sh", "-c", "php-fpm -D && caddy run --config /etc/caddy/Caddyfile"]
