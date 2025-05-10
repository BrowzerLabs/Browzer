import sys
from PyQt5.QtCore import QUrl
from PyQt5.QtWidgets import (QApplication, QMainWindow, QToolBar, 
                            QAction, QLineEdit, QProgressBar, QStyle)
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEnginePage
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import Qt

class Browser(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('Simple Browser')
        self.setGeometry(100, 100, 1024, 768)

        # Create a web view widget
        self.web_view = QWebEngineView()
        self.setCentralWidget(self.web_view)

        # Create navigation toolbar
        nav_toolbar = QToolBar()
        nav_toolbar.setMovable(False)
        self.addToolBar(nav_toolbar)

        # Back button
        back_btn = QAction(self.style().standardIcon(QStyle.SP_ArrowBack), 'Back', self)
        back_btn.triggered.connect(self.web_view.back)
        nav_toolbar.addAction(back_btn)

        # Forward button
        forward_btn = QAction(self.style().standardIcon(QStyle.SP_ArrowForward), 'Forward', self)
        forward_btn.triggered.connect(self.web_view.forward)
        nav_toolbar.addAction(forward_btn)

        # Reload button
        reload_btn = QAction(self.style().standardIcon(QStyle.SP_BrowserReload), 'Reload', self)
        reload_btn.triggered.connect(self.web_view.reload)
        nav_toolbar.addAction(reload_btn)

        # URL bar
        self.url_bar = QLineEdit()
        self.url_bar.returnPressed.connect(self.navigate_to_url)
        nav_toolbar.addWidget(self.url_bar)

        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMaximumWidth(120)
        nav_toolbar.addWidget(self.progress_bar)

        # Connect signals
        self.web_view.urlChanged.connect(self.update_url)
        self.web_view.loadProgress.connect(self.update_progress)

        # Set default page
        self.web_view.setUrl(QUrl('https://www.google.com'))

    def navigate_to_url(self):
        url = self.url_bar.text()
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        self.web_view.setUrl(QUrl(url))

    def update_url(self, url):
        self.url_bar.setText(url.toString())

    def update_progress(self, progress):
        self.progress_bar.setValue(progress)

def main():
    app = QApplication(sys.argv)
    browser = Browser()
    browser.show()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main() 