const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
    output: 'export',
    basePath: isProd ? '/stock-screener' : '',
    assetPrefix: isProd ? '/stock-screener/' : '',
    images: {
        unoptimized: true,
    }
};

module.exports = nextConfig;
