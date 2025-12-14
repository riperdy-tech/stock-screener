const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
    output: 'export',
    basePath: isProd ? '/stock-screener' : '',
    images: {
        unoptimized: true,
    }
};

module.exports = nextConfig;
