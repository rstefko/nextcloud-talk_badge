<?php

declare(strict_types=1);

namespace OCA\TalkBadge\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\IUserSession;
use OCP\Util;

class Application extends App implements IBootstrap {
    public function __construct() {
        parent::__construct('talk_badge');
    }

    public function register(IRegistrationContext $context): void {
    }

    public function boot(IBootContext $context): void {
        $context->injectFn(function (IUserSession $userSession): void {
            if ($userSession->isLoggedIn()) {
                Util::addScript('talk_badge', 'badge');
            }
        });
    }
}
