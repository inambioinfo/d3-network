/* Reusable d3 force-directed layout for gene networks
 * Follows the design pattern suggested by Mike Bostock:
 * http://bost.ocks.org/mike/chart/
 */

(function() {

d3.network = function() {

    var options =
        {start_color:"#006E2E",
        mid_color:"#FFFF88",
        end_color:"#FF0000"};

    var force,
        edges = [],
        genes = [],
        gene_map = {},
        draw_genes = [],
        draw_edges = [],
        height,
        width,
        selection,
        edgeLegendEnabled = false,
        edge_events = {},
        gene_events = {},
        bind_networks = [],
        edgeLegendText = 'Relationship confidence',
        min_edge = 0,
        max_edge = 1,
        edgeLegendStart = min_edge,
        edgeLegendEnd = max_edge,
        // Variables related to gene color legend bar:
        geneColorEnabled = false,
        geneLegendText = 'Gene Expression Value',
        min_gene_expr = -1,
        max_gene_expr = 1,
        geneLegendStart = min_gene_expr,
        geneLegendEnd = max_gene_expr,

        // Flag that indicates whether force simulation will be enabled
        // when rendering the network. Default is true.
        forceSimulation = true,

        // Flag that indicates whether background correction should be
        // applied when the genes are ranked. Default is true.
        bgCorrection = true,

        event = d3.dispatch("edgeadd", "edgeremove",
                "geneadd", "generemove", "genechange");

    // Functions for network attributes
    var r = function(d) {return d.query ? 20 : Math.max(10,5+ d.query_degree ? d.query_degree*10 : 10);};
    var w = function(d) {return Math.max(2, Math.abs(d.weight)*6);};
    var edgeColor = d3.scale.linear().domain([min_edge, 0.15, max_edge])
        .range([options.start_color, options.mid_color, options.end_color]);

    // Gene circle's color
    var geneColor = d3.scale.linear().domain([min_gene_expr, 0.15, max_gene_expr])
        .range([options.start_color, options.mid_color, options.end_color]);

    var geneText = function(d) { return d.standard_name; };

    function my(_selection) {
        selection = _selection;

        if ( !width ) width = selection.attr("width");
        if ( !height) height = selection.attr("height");

        var i,
            n = genes.length, m = edges.length,
            gene, edge;

        // Bind nodes to edges
        for (i = 0; i < m; ++i) {
          edge = edges[i];
          if (typeof edge.source == "number") edge.source = genes[edge.source];
          if (typeof edge.target == "number") edge.target = genes[edge.target];
        }

        // Calculate node degrees to query genes and all genes
        for( i = 0; i < n; i++ ) {
            gene = genes[i];
            gene.query_degree = 0;
            gene.query_degreen = 0;
            gene.degree = 0;
            gene.degreen = 0;
        }
        for( i = 0; i < m; i++ ) {
            edge = edges[i];
            if ( edge.source.query ) {
                edge.target.query_degree += Math.abs(edge.weight);
                edge.target.query_degreen ++;
            }
            if ( edge.target.query ) {
                edge.source.query_degree += Math.abs(edge.weight);
                edge.source.query_degreen ++;
            }
            edge.target.degree += Math.abs(edge.weight);
            edge.source.degree += Math.abs(edge.weight);
            edge.target.degreen ++;
            edge.source.degreen ++;
        }
        for( i = 0; i < n; i++ ) {
            genes[i].query_degree /= genes[i].query_degreen;
            genes[i].degree /= genes[i].degreen;
        }

        // Sort nodes and store corresponding ranks.
        // Depending on whether bgCorrection flag is set, the sorting may or
        // may not be done according to the background corrected degree.
        // -------------------------------------------------------------------
        // Some genes are connected to many genes, while others may be
        // connected to few genes.  Without background correction, the network
        // view prioritizes the genes that are most connected to the query
        // genes. With the optional background correction step, the network
        // view prioritizes genes that are more connected to the query genes
        // than to other genes.
        // See the following discussion for more details:
        //   https://github.com/greenelab/adage-server/issues/295
        // -------------------------------------------------------------------
        if (bgCorrection) {
          genes.sort(function(a,b){return b.query_degree/b.degree
                                   -a.query_degree/a.degree;});
        } else {
          genes.sort(function(a,b){return b.query_degree-a.query_degree;});
        }
        for( i = 0; i < n; i++ ) { genes[i].rank = i; }
    }

    function draw(genes, edges) {
        if ( typeof force != "undefined" ) force.stop();

        force = d3.layout.force()
            .charge(-800)
            .distance(150)
            .gravity(.15)
            .nodes(genes)
            .links(edges)
            .size([width, height]).start();

        var node_data = selection.selectAll("g.gene-group")
                .data(genes, function(d) { return d.id; });
        var link_data = selection.selectAll("line.edge")
                .data(edges, function(d) { return d.id; });

        var link_rm = link_data.exit().remove();
        var link = link_data
                .enter().insert("svg:line", "g")
                .attr("class", "edge")
                .on("mouseover", linkMouseover)
                .on("mouseout", linkMouseout)
                .attr("id", function(d) { return d.id; })
                .style("stroke", function(d) {return edgeColor(d.weight);})
                .style("stroke-width", w);
        for( var type in edge_events ) link.on(type, edge_events[type]);
        event.edgeadd(link.filter(function(d){return d;}));
        event.edgeremove(link_rm.filter(function(d){return d;}));

        var node_rm = node_data.exit().remove();
        var node = node_data // customize node color here!
                .enter().append("svg:g")
                .attr("class", "gene-group")
                .on("mouseover", nodeMouseover)
                .on("mouseout", nodeMouseout)
                .on("click", nodeMouseclick)
                .on("mousedown", nodeMousedown)
                .attr("id", function(d) { return d.id; });

        for( var type in gene_events ) node.on(type, gene_events[type]);
        event.geneadd(node.filter(function(d){return d;}));
        event.generemove(node_rm.filter(function(d){return d;}));
        event.genechange(node.filter(function(d){return d;}), node_rm.filter(function(d){return d;}));

        node.append("svg:circle")
            .attr("class", "gene")
            .classed("gene-query", function(d) { return d.query; })
            // Set each gene circle's color based on the gene's "exprVal" property.
            // If the property is undefined or null, set its color to "gray".
            .style("fill", function(d) {
              if (d.exprVal === undefined || d.exprVal === null) {
                return "#CCCCCC";
              } else {
                return geneColor(d.exprVal)
              }
            })
            .attr("r", r);

        node.append("svg:text")
            .style("pointer-events","none")
            .attr("class", "gene-name")
            .attr("text-anchor", "middle")
            .attr("y", function(d) { return "-"+ (r(d)+5);})
            .text(geneText)

        node_data.call(force.drag);

        force.on("tick", function(event) {
            node_data.attr('cx', function(d) {
                return d.x = Math.max(r(d),Math.min(width-r(d),d.x)); });
            node_data.attr('cy', function(d) {
                return d.y = Math.max(r(d),Math.min(height-r(d),d.y)); });
            node_data.attr("transform", function(d,i) {
                if ( bind_networks[0] && bind_networks[0].gene(d.id)
                        && !isNaN(bind_networks[0].gene(d.id).x)) {
                    var ref = bind_networks[0].gene(d.id);
                    d.x = ref.x;
                    d.px = ref.px;
                    d.y = ref.y;
                    d.py = ref.py;
                }
                var x = Math.max(r(d),Math.min(width-r(d),d.x));
                var y = Math.max(r(d),Math.min(height-r(d),d.y));
                return "translate(" + x + "," + y + ")";
            });
            link_data.attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });

            // Aaron Wang's suggestion on how to stop force simulation:
            // https://github.com/greenelab/adage-server/issues/124#issuecomment-298411890
            // After layout, fix all nodes in place:
            if (!forceSimulation && event.alpha * .99 < .005 && event.alpha > 0) {
              selection.selectAll("circle.gene").each(function(g) {
                  g.fixed = true;
              });
            }
        });
    }

    my.draw = function() {
        draw(draw_genes, draw_edges);
        // Draw edge legend bar if needed
        var drawn = !selection.select("svg.edge-legend").empty();
        if (!drawn && edgeLegendEnabled) {
            addEdgeLegend();
        }
        else if (drawn && !edgeLegendEnabled) {
            d3.select("svg.edge-legend").remove();
        }
        // Draw gene legend bar if needed
        drawn = !selection.select("svg.gene-legend").empty();
        if (!drawn && geneColorEnabled) {
            addGeneLegend();
        }
        else if (drawn && !geneColorEnabled) {
            d3.select("svg.gene-legend").remove();
        }
    };

    my.showEdgeLegend = function(x) {
        if (!arguments.length) {
          x = true;
        }
        edgeLegendEnabled = x;
        return my;
    };

    function set_draw_genes() {
        // Remove hanging nodes: calculate node degrees to the filtered edges
        var n = genes.length,
            m = draw_edges.length,
            edge, i;
        for( i = 0; i < n; i++ ) {
            genes[i].draw_degree = 0;
        }
        for( i = 0; i < m; i++ ) {
            edge = draw_edges[i];
            edge.source.draw_degree += Math.abs(edge.weight);
            edge.target.draw_degree += Math.abs(edge.weight);
        }
        draw_genes = draw_genes.filter(function(d) {
            return d.draw_degree > 0 || d.query; })
    }

    my.filter = function(edge_cut, node_cut) {
        var gene_filter = function(d) {
            return d.query || d.rank < node_cut;
        };

        var edge_filter = function(d) {
            return d.weight > edge_cut && gene_filter(d.target)
            && gene_filter(d.source);
        };

        draw_genes = genes.filter(gene_filter);
        draw_edges = edges.filter(edge_filter);
        set_draw_genes();

        return my;
    };

    my.filterWithWeightSign = function(min_edge_cut, max_edge_cut, weightSign,
                                       node_cut) {
        var gene_filter = function(d) {
            return d.query || d.rank < node_cut;
        };

        var edge_filter = function(d) {
            if (max_edge_cut < 0) { // Input edge_cut values must be positive
              return false;
            }

            if (!gene_filter(d.target) || !gene_filter(d.source)) {
              return false;
            }

            var cmpVal;
            if (!weightSign) {
                cmpVal = Math.abs(d.weight);
            } else if (weightSign < 0) {
                cmpVal = -d.weight;
            } else if (weightSign > 0) {
                cmpVal = d.weight;
            } else {  // in case weightSign is not even a valid number
                cmpVal = Math.abs(d.weight);
            }

            return cmpVal > min_edge_cut && cmpVal < max_edge_cut;
        };

        draw_genes = genes.filter(gene_filter);
        draw_edges = edges.filter(edge_filter);
        set_draw_genes();

        return my;
    };

    my.onEdge = function(type, listener) {
        if ( typeof listener == "function" ) edge_events[type] = listener;
        return my;
    };

    my.edgeColor = function(x) {
        if (!arguments.length) return edgeColor;
        if ( typeof x == "function" ) edgeColor = x;
        else edgeColor = function(d) { return x; };
        return my;
    };

    my.edgeLegendText = function(x) {
        if (!arguments.length) return edgeLegendText;
        edgeLegendText = x;
        return my;
    };

    my.edgeLegendStart = function(x) {
        if (!arguments.length) return edgeLegendStart;
        edgeLegendStart = x;
        return my;
    };

    my.edgeLegendEnd = function(x) {
        if (!arguments.length) return edgeLegendEnd;
        edgeLegendEnd = x;
        return my;
    };

    my.minEdge = function(x) {
        if (!arguments.length) return min_edge;
        min_edge = x;
        return my;
    };

    my.maxEdge = function(x) {
        if (!arguments.length) return max_edge;
        max_edge = x;
        return my;
    };

    my.edgeWidth = function(x) {
        if (!arguments.length) return w;
        if ( typeof x == "function" ) w = x;
        else w = function(d) { return x; };
        return my;
    };

    my.onGene = function(type, listener) {
        if ( typeof listener == "function" ) gene_events[type] = listener;
        return my;
    };

    // Function that enables legend bar of gene colors in the network.
    my.showGeneLegend = function(x) {
        if (!arguments.length) {
          x = true;
        }
        geneColorEnabled = x;
        return my;
    };

    // Function that gets or sets gene circle's color.
    my.geneColor = function(x) {
        if (!arguments.length) {
            return geneColor;
        }
        if (typeof x == "function") {
            geneColor = x;
        } else {
            geneColor = function(d) { return x; };
        }
        return my;
    };

    // Function that gets or sets text of legend bar for gene circle's color.
    my.geneLegendText = function(x) {
        if (!arguments.length) {
            return geneLegendText;
        }
        geneLegendText = x;
        return my;
    };

    // Function that gets or sets the starting value of legend bar for gene
    // circle's color.
    my.geneLegendStart = function(x) {
        if (!arguments.length) {
            return geneLegendStart;
        }
        geneLegendStart = x;
        return my;
    };

    // Function that gets or sets the ending value of legend bar for gene
    // circle's color.
    my.geneLegendEnd = function(x) {
        if (!arguments.length) {
            return geneLegendEnd;
        }
        geneLegendEnd = x;
        return my;
    };

    // Function that gets or sets the minimum of gene expression value on
    // the legend bar for gene circle's color.
    my.minGeneExpr = function(x) {
        if (!arguments.length) {
            return min_gene_expr;
        }
        min_gene_expr = x;
        return my;
    };

    // Function that gets or sets the maximum of gene expression value on
    // the legend bar for gene circle's color.
    my.maxGeneExpr = function(x) {
        if (!arguments.length) {
            return max_gene_expr;
        }
        max_gene_expr = x;
        return my;
    };

    my.geneRadius = function(x) {
        if (!arguments.length) return r;
        if ( typeof x == "function" ) r = x;
        else r = function(d) { return x; };
        return my;
    };

    my.geneText = function(x) {
        if (!arguments.length) return geneText;
        if ( typeof x == "function" ) geneText = x;
        else geneText = function(d) { return x; };
        return my;
    };

    my.drawGenes = function() {
        return draw_genes;
    };

    my.drawEdges = function() {
        return draw_edges;
    };

    my.height = function(x) {
        if (!arguments.length) return height;
        height = x;
        return my;
    };

    my.width = function(x) {
        if (!arguments.length) return width;
        width = x;
        return my;
    };

    my.bindNetworks = function(x) {
        if (!arguments.length) return bind_networks;
        bind_networks = x;
        return my;
    };

    my.resume = function() {
        force.resume();
    };

    my.gene = function(x) {
        return gene_map[x];
    };

    my.genes = function(x) {
        if (!arguments.length) return genes;
        genes = x;
        draw_genes = x;
        for( var i = 0, n = genes.length; i < n; i++ ) {
            gene_map[genes[i].id] = genes[i];
        }
        return my;
    };

    my.edges = function(x) {
        if (!arguments.length) return edges;
        edges = x;
        draw_edges = x;
        return my;
    };

    // Function that gets or sets the forceSimulation flag.
    my.forceSimulation = function(x) {
        if (!arguments.length) {
          return forceSimulation;
        }
        forceSimulation = x;
        return my;
    };

    // Function that gets or sets the background correction option.
    my.bgCorrection = function(x) {
        if (!arguments.length) {
          return bgCorrection;
        }
        bgCorrection = x;
        return my;
    };

    function linkMouseover(d) {
        d3.select(this).style("stroke-width",12).style("cursor","pointer");
        var genes = selection.selectAll("circle.gene").filter(function(node,i) {
            return node.id == d.source.id || node.id == d.target.id;
        }).style("stroke-dasharray","6, 3");
    }

    function linkMouseout(d) {
        d3.select(this).style("stroke-width", w);
        var genes = selection.selectAll("circle.gene").filter(function(node,i) {
            return node.id == d.source.id || node.id == d.target.id;
        }).style("stroke-dasharray",null);
    }

    function nodeMouseover(d) {
        selection.selectAll("line.edge").filter(function(edge,i) {
            return ( edge.source.id == d.id || edge.target.id == d.id );
        }).style("stroke-dasharray","6, 3");
    }

    function nodeMouseout(d) {
        selection.selectAll("line.edge").filter(function(edge,i) {
            return ( edge.source.id == d.id || edge.target.id == d.id );
        }).style("stroke-dasharray",null);
    }

    function nodeMouseclick(d) {
        d.fixed = true;
    }

    function nodeMousedown(d) {
        d.fixed = true;

        if ( bind_networks.length ) {
            var tmp = bind_networks[0];
            bind_networks[bind_networks.indexOf(my)] = tmp;
            bind_networks[0] = my;
            for ( var i=0, n=bind_networks.length; i<n; i++ ) {
                bind_networks[i].resume();
            }
        }
    }

    function addEdgeLegend(scale) {
        if (!scale) {
            scale = .8;
        }

        var svg = selection.append("svg:svg")
            .attr("class","edge-legend")
            .attr("width", width*scale)
            .attr("height", 55)
            .attr("x", width*(1-scale)*.5)
            .attr("y", height-55);

        var edgeLegend = svg.append("svg:defs")
            .append("svg:linearGradient")
            .attr("id", "edgelegend")
            .attr("x1","0%")
            .attr("y1","0%")
            .attr("x2","100%")
            .attr("y2","0%")
            .attr("spreadMethod", "pad");

        for ( var i=0; i<1; i+=.05 ) {
            edgeLegend.append("svg:stop")
                .attr("offset", parseInt(i*100)+"%")
                .style("stop-color",
                        edgeColor(min_edge + (max_edge - min_edge) * i))
                .style("stop-opacity", .9);
        }

        svg.append("svg:rect")
            .attr("width", width*scale-2)
            .attr("height", 20)
            .attr("y",12)
            .attr("x", 1)
            .attr("fill", "url(#edgelegend)")
            .style("stroke","#AAA")
            .style("stroke-width",1);

        var text = svg.append("svg:text")
            .attr("class", "legend-mark")
            .attr("y", 9)
            .text(edgeLegendStart.toFixed(1));

       svg.append("svg:text")
            .attr("class", "legend-mark")
            .attr("y", 9)
            .attr("x", width*scale - text.node().getBBox().width)
            .text(edgeLegendEnd.toFixed(1));

        svg.append("svg:text")
            .attr("class", "legend-mark")
            .attr("y", 9)
            .attr("x", width*scale*.5 - text.node().getBBox().width/2)
            .text(((edgeLegendStart + edgeLegendEnd) / 2).toFixed(1));

        svg.append("svg:text")
            .attr("class", "legend-title")
            .attr("y", 45)
            .attr("x", width*scale/2)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "central")
            .text(edgeLegendText);
    }

    // Add legend bar for the color of each gene circle:
    function addGeneLegend(scale) {
        if (!scale) {
          scale = .8;
        }

        // Put the legend bar at the left side of svg
        var svg = selection.append("svg:svg")
            .attr("class","gene-legend")
            .attr("width", 55)
            .attr("height", height * scale)
            .attr("x", 0) // was 10, -10 also works, but -20 doesn't.
            .attr("y", 40);

        var geneLegend = svg.append("svg:defs")
            .append("svg:linearGradient")
            .attr("id", "genelegend")
            .attr("x1","0%")
            .attr("y1","100%")
            .attr("x2","0%")
            .attr("y2","0%")
            .attr("spreadMethod", "pad");

        for (var i = 0; i < 1.0; i += 0.05) {
            geneLegend.append("svg:stop")
                .attr("offset", parseInt(i*100)+"%")
                .style("stop-color",
                       geneColor(min_gene_expr +
                                 (max_gene_expr - min_gene_expr) * i))
                .style("stop-opacity", .9);
        }

        svg.append("svg:rect") // Define a rectangle to wrap geneLegend
            .attr("width", 15)
            .attr("height", height * scale - 40)
            .attr("x", 30) // was 30
            .attr("y", 30) // was 30
            .attr("fill", "url(#genelegend)")
            .style("stroke", "#AAA")
            .style("stroke-width", 1);

        svg.append("svg:text") // legend mark at the top
            .attr("class", "legend-mark")
            .attr("x", 10)
            .attr("y", 30)
            .text(geneLegendEnd.toFixed(1));

        svg.append("svg:text") // legend mark at the bottom
            .attr("class", "legend-mark")
            .attr("x", 10)
            .attr("y", height * scale)
            .text(geneLegendStart.toFixed(1));

        // dx and dy are values of translation in X and Y directions.
        // When height is 600 and scale is 0.8, dx = -220, dy = 250.
        var dx = -height * scale / 2 + 20;
        var dy =  height * scale / 2 + 10;
        svg.append("svg:text") // title of legend bar
            .attr("class", "legend-title")
            .attr("x", 20)
            .attr("y", height * scale / 2)
            .attr("text-anchor", "middle")
            .attr("transform", "translate(" + dx + ", " + dy + ") rotate(-90)")
            .text(geneLegendText);

    }

    return d3.rebind(my, event, "on");
} // network

})();
