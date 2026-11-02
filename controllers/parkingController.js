const getParkingSupportPage = (req, res) => {
    res.render('parking/index', {
        pageTitle: '주차지원',
        currentPath: '/parking'
    });
};

module.exports = {
    getParkingSupportPage
};