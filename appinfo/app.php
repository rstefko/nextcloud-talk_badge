<?php
if (\OC::$server->getUserSession()->isLoggedIn()) {
    \OCP\Util::addScript('talk_badge', 'badge');
}
