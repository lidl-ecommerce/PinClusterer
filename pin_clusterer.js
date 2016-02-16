/**
 * https://github.com/lidl-ecommerce/PinClusterer/
 */
(function PinClustererClass() {
    'use strict';
    /**
     * @param { object } map Microsoft.Maps.Map  the map to be show the clusters on
     * @param { Object } options: support the following options:
     * @param { object } Microsoft Api Class
     * gridSize: (number) The grid size of a cluster in pixels.
     * maxZoom: (number) The maximum zoom level that a pin can be part of a cluster.
     * onClusterToMap: a function that accepts a parameter pointing at the center of each cluster.
     * It gets called before the cluster is added to the map, so you can change the all options
     * by calling center.setOptions(Microsoft.Maps.PushpinOptions)
     * where center is an instance of Microsoft.Maps.Pushpin
     *
     * @properties:
     * layer: (Microsoft.Maps.Layer) the layer holding the clusters
     * options: (Array) a copy of the options passed
     * gridSize: (number) the actual grid size used
     * maxZoom: (number) the actual maximum zoom used
     *
     */

    var _defaults = {
        debug: false,
        pinTypeName: 'pin_clusterer pin',
        clusterTypeName: 'pin_clusterer cluster',
        pinSize: 16,
        extendMapBoundsBy: 2,
        gridSize: 60,
        maxZoom: 16,
        clickToZoom: true,
        onClusterToMap: null
    };

    // Minimum zoom level before bounds dissappear
    var MIN_ZOOM = 2;

    /**
     * Alias for Microsoft.Maps
     * @type {object} Microsoft.Maps
     */
    var mm = null;

    var PinClusterer = function PinClusterer(map, options, microsoft) {
        var Microsoft = microsoft ? microsoft : window.Microsoft;
        this.map = map;
        this.options = options;
        this.layer = null;

        this.setOptions(this.options);
        this.doClickToZoom = _defaults.clickToZoom;

        if (Microsoft && Microsoft.Maps && (map instanceof Microsoft.Maps.Map)) {

            // Create a shortcut
            mm = Microsoft.Maps;

            this.layer = new mm.EntityCollection();
            this.map.entities.push(this.layer);
            this.loaded = true;
        }
    };

    PinClusterer.prototype = {

        cluster: function cluster(latlongs) {
            if (!this.loaded) {
                return;
            }
            if (!latlongs) {
                if (!this._latlongs) {
                    return;
                }
            } else {
                this._latlongs = latlongs;
            }
            var self = this;
            if (this._viewchangeendHandler) {
                this._redraw();
            } else {
                this._viewchangeendHandler = mm.Events.addHandler(this.map, 'viewchangeend',
                    function _viewchangeendHandlerCallback() {
                        self._redraw();
                    });
            }
        },

        _redraw: function _redraw() {
            var started;
            if (_defaults.debug) {
                started = new Date();
            }
            if (!this._latlongs) {
                return;
            }
            this._metersPerPixel = this.map.getMetersPerPixel();
            this._bounds = this.getExpandedBounds(this.map.getBounds(), _defaults.extendMapBoundsBy);
            this._zoom = this.map.getZoom();
            this._clusters = [];
            this.doClickToZoom = true;
            this.layer.clear();
            this.each(this._latlongs, this._addToClosestCluster);
            this.toMap();
            if (_defaults.debug && started) {
                _log((new Date()) - started);
            }
        },

        _addToClosestCluster: function _addToClosestCluster(latlong) {
            var distance = 40000;
            var location = new mm.Location(latlong.latitude, latlong.longitude);
            var clusterToAddTo = null;
            var d;
            if (this._zoom > MIN_ZOOM && !this._bounds.contains(location)) {
                return;
            }

            if (this._zoom >= _defaults.maxZoom) {
                this.doClickToZoom = false;
                this._createCluster(location, latlong.data);
                return;
            }

            this.each(this._clusters, function _addToClosestClusterEachCallback(cluster) {
                d = this._distanceToPixel(cluster.center.location, location);
                if (d < distance) {
                    distance = d;
                    clusterToAddTo = cluster;
                }
            });

            if (clusterToAddTo && clusterToAddTo.containsWithinBorders(location)) {
                clusterToAddTo.add(location, latlong.data);
            } else {
                this._createCluster(location, latlong.data);
            }
        },

        _createCluster: function _createCluster(location, data) {
            var cluster = new Cluster(this);
            cluster.add(location, data);
            this._clusters.push(cluster);
        },

        setOptions: function setOptions(options) {
            for (var opt in options) {
                if (options.hasOwnProperty(opt)) {
                    if (_defaults.hasOwnProperty(opt) && typeof _defaults[opt] !== 'undefined') {
                        _defaults[opt] = options[opt];
                    }

                }
            }
        },

        toMap: function toMap() {
            this.each(this._clusters, function toMapEachCallback(cluster) {
                cluster.toMap();
            });
        },

        getExpandedBounds: function getExpandedBounds(bounds, gridFactor) {
            var northWest = this.map.tryLocationToPixel(bounds.getNorthwest());
            var southEast = this.map.tryLocationToPixel(bounds.getSoutheast());
            var size = gridFactor ? _defaults.gridSize * gridFactor : _defaults.gridSize / 2;
            if (northWest && southEast) {
                northWest = this.map.tryPixelToLocation(new mm.Point(northWest.x - size, northWest.y - size));
                southEast = this.map.tryPixelToLocation(new mm.Point(southEast.x + size, southEast.y + size));
                if (northWest && southEast) {
                    bounds = mm.LocationRect.fromCorners(northWest, southEast);
                }
            }
            return bounds;
        },

        _distanceToPixel: function _distanceToPixel(l1, l2) {
            return PinClusterer.distance(l1, l2) * 1000 / this._metersPerPixel;
        },

        each: function each(items, fn) {
            if (!items.length) {
                return;
            }
            var i;
            var item;
            for (i = 0; item = items[i]; i++) { // jshint ignore:line
                var rslt = fn.apply(this, [item, i]);
                if (rslt === false) {
                    break;
                }
            }
        }

    };

    PinClusterer.distance = function distance(p1, p2) {
        if (!p1 || !p2) {
            return 0;
        }
        var R = 6371;
        var pi180 = Math.PI / 180;
        var dLat = (p2.latitude - p1.latitude) * pi180;
        var dLon = (p2.longitude - p1.longitude) * pi180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.latitude * pi180) * Math.cos(p2.latitude * pi180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c);
    };

    var Cluster = function Cluster(pinClusterer) {
        this._pinClusterer = pinClusterer;
        this.locations = [];
        this.center = null;
        this._bounds = null;
        this.length = 0;
        this.doClickToZoom = this._pinClusterer.doClickToZoom;
    };

    Cluster.prototype = {
        add: function add(location, data) {
            if (this._alreadyAdded(location)) {
                return;
            }
            this.locations.push(location);
            this.length += 1;
            if (!this.center) {
                var options;
                if (data) {
                    options = data;
                } else {
                    options = {};
                }
                this.center = new Pin(location, this, options);
                this._calculateBounds();
            }
        },

        containsWithinBorders: function containsWithinBorders(location) {
            if (this._bounds) {
                return this._bounds.contains(location);
            }
            return false;
        },

        zoom: function zoom() {
            var zoomVal = this._pinClusterer.map.getZoom();
            this._pinClusterer.map.setView({
                    center: this.center.location,
                    zoom: (zoomVal <= _defaults.maxZoom + 2) ? zoomVal + 2 : _defaults.maxZoom
                }
            );
        },

        _alreadyAdded: function _alreadyAdded(location) {
            if (this.locations.indexOf) {
                return this.locations.indexOf(location) > -1;
            } else {
                var i;
                var l;
                for (i = 0; l = this.locations[i]; i++) { // jshint ignore:line
                    if (l === location) {
                        return true;
                    }
                }
            }
            return false;
        },

        _calculateBounds: function _calculateBounds() {
            var bounds = mm.LocationRect.fromLocations(this.center.location);
            this._bounds = this._pinClusterer.getExpandedBounds(bounds);
        },

        toMap: function toMap() {
            this._updateCenter();
            this.center.toMap(this._pinClusterer.layer);
            if (!_defaults.debug) {
                return;
            }
            var north = this._bounds.getNorth();
            var east = this._bounds.getEast();
            var west = this._bounds.getWest();
            var south = this._bounds.getSouth();
            var nw = new mm.Location(north, west);
            var se = new mm.Location(south, east);
            var ne = new mm.Location(north, east);
            var sw = new mm.Location(south, west);
            var color = new mm.Color(100, 100, 0, 100);
            var poly = new mm.Polygon([nw, ne, se, sw], {fillColor: color, strokeColor: color, strokeThickness: 1});
            this._pinClusterer.layer.push(poly);
        },

        _updateCenter: function _updateCenter() {
            var typeName = _defaults.pinTypeName;
            var count = this.locations.length;
            if (count > 1) {
                typeName = _defaults.clusterTypeName;
            }
            this.center.pushpin.setOptions({
                'typeName': typeName
            });
            if (_defaults.onClusterToMap) {
                _defaults.onClusterToMap.apply(this._pinClusterer, [this.center.pushpin, this]);
            }
        }
    };

    var Pin = function Pin(location, cluster, options) {
        this.location = location;
        this._cluster = cluster;

        // The default options of the pushpin showing at the centre of the cluster
        // Override within onClusterToMap function

        this._options = options || {};
        this._options.typeName = this._options.typeName || _defaults.pinTypeName;
        this._options.height = _defaults.pinSize;
        this._options.width = _defaults.pinSize;

        //this._options.anchor = new mm.Point(_defaults.pinSize / 2, _defaults.pinSize / 2);
        this._options.textOffset = new mm.Point(0, 2);
        this._create();
    };

    Pin.prototype = {
        _create: function _create() {
            this.pushpin = new mm.Pushpin(this.location, this._options);
            if (this._cluster.doClickToZoom) {
                var self = this;
                mm.Events.addHandler(this.pushpin, 'mouseup', function bindMouseUpEvent() {
                    self._cluster.zoom();
                });
            }
        },
        toMap: function toMap(layer) {
            layer.push(this.pushpin);
        }
    };

    var _log = function _log(msg) {
        if (console && console.log) {
            console.log(msg);
        }
    };

    /* expose PinClusterer */
    window.PinClusterer = PinClusterer;

    /* expose PinClusterer */
    if (typeof module === 'object' && typeof module.exports === 'object') {
        // CommonJS, just export
        module.exports = PinClusterer;
    } else if (typeof define === 'function' && define.amd) {
        // AMD support
        define('PinClusterer', function PinClustererDef() {
            return PinClusterer;
        });
    }
})();
