const nextConfig = {
    // Settings optimized for Vercel deployment
    basePath: '',
    images: {
        unoptimized: true,
    },
    async headers() {
        return [
            {
                source: '/data/:path*',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate, s-maxage=0' },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
